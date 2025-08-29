import esbuild from 'esbuild';
import pkg from '@esbuild-plugins/node-modules-polyfill';
const { NodeModulesPolyfillPlugin } = pkg;

// Common build options
const commonOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
  minify: false,
  plugins: [NodeModulesPolyfillPlugin()],
  external: [
    // External dependencies that shouldn't be bundled
    '@anthropic-ai/sdk',
    'openai',
    'chokidar',
    'commander',
    'chalk',
    'yaml'
  ],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
};

// CLI-specific build options - build as ES module
const cliOptions = {
  ...commonOptions,
  entryPoints: ['src/cli/index.ts'],
  outdir: 'dist/cli',
  format: 'esm'
};

// Test runner build options
const testRunnerOptions = {
  ...commonOptions,
  entryPoints: ['src/core/__tests__/test-runner.ts'],
  outdir: 'dist/core/__tests__',
  format: 'esm'
};

// Build function
async function build(watch = false, runnerOnly = false) {
  try {
    if (watch) {
      // Watch mode
      const disposers = [];
      if (runnerOnly) {
        const testRunnerContext = await esbuild.context(testRunnerOptions);
        await testRunnerContext.watch();
        disposers.push(() => testRunnerContext.dispose());
      } else {
        const context = await esbuild.context(commonOptions);
        const cliContext = await esbuild.context(cliOptions);
        await context.watch();
        await cliContext.watch();
        disposers.push(() => context.dispose());
        disposers.push(() => cliContext.dispose());
      }
      
      console.log('🔍 Watching for changes...');
      
      // Keep the process running
      process.on('SIGINT', () => {
        while (disposers.length) {
          const d = disposers.pop();
          try { d && d(); } catch {}
        }
        process.exit(0);
      });
    } else {
      // Single build
      if (runnerOnly) {
        // Build only the test runner
        await esbuild.build(testRunnerOptions);
        console.log('✅ Test runner built successfully');
      } else {
        // Build main library
        await esbuild.build(commonOptions);
        console.log('✅ Main library built successfully');
        
        // Build CLI
        await esbuild.build(cliOptions);
        console.log('✅ CLI built successfully');
        
        // Create a wrapper CLI file that can be executed
        const fs = await import('fs');
        const path = await import('path');
        const cliWrapperPath = path.join('dist', 'cli', 'cli.js');
        const cliContent = `#!/usr/bin/env node
import('./index.js').then(module => {
  // The CLI should handle its own execution
  if (module.default) {
    module.default();
  }
}).catch(error => {
  console.error('Failed to load CLI:', error);
  process.exit(1);
});`;
        
        fs.writeFileSync(cliWrapperPath, cliContent);
        fs.chmodSync(cliWrapperPath, '755');
        console.log('✅ CLI wrapper created and made executable');
      }
    }
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const isWatch = process.argv.includes('--watch');
  const isRunner = process.argv.includes('--runner');
  build(isWatch, isRunner);
}

export { build, commonOptions, cliOptions };
