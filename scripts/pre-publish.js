import fs from 'node:fs';
import semver from 'semver';

const newVersion = semver.valid(semver.coerce(process.env.TAG_NAME));
console.info('New version is %s', newVersion);

if (!newVersion) {
  throw new Error(`Tag name ${process.env.TAG_NAME} is not valid.`);
}

const contents = JSON.parse(fs.readFileSync('package.json').toString());
contents.version = newVersion;

fs.writeFileSync('package.json', JSON.stringify(contents, undefined, 2));
console.info('package.json updated');
