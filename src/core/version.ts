// Import package.json to get the version
// import * as path from 'path';
// import * as fs from 'fs';

// Resolve package.json path - works with both normal installs and symlinks
// Walk up from __dirname to find package.json
// let packageJsonPath: string | null = null;
// let currentDir = __dirname;

// Walk up the directory tree to find package.json
// while (currentDir !== path.dirname(currentDir)) {
//   const candidate = path.join(currentDir, 'package.json');
//   if (fs.existsSync(candidate)) {
//     packageJsonPath = candidate;
//     break;
//   }
//   currentDir = path.dirname(currentDir);
// }

// if (!packageJsonPath) {
//   throw new Error('Cannot find package.json for neozipkit');
// }

// const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Get current date for release date
const currentDate = new Date();
const releaseDate = `${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}-${currentDate.getFullYear()}`;

export const VERSION = {
  number: '0.3.1', // packageJson.version,
  date: releaseDate
}; 