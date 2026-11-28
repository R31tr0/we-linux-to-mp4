const fs = require('fs');

const MAX_VERSION_LENGTH = 64;
const MAX_NAME_LENGTH = 1024;
const MAX_FILE_COUNT = 100000;

function readExact(fd, length, position) {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(fd, buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error('Неожиданный конец файла: это не .pkg или файл повреждён');
  }
  return buffer;
}

function parsePkg(fd) {
  let cursor = 0;
  const readUInt32 = () => {
    const value = readExact(fd, 4, cursor).readUInt32LE(0);
    cursor += 4;
    return value;
  };

  const versionLength = readUInt32();
  if (versionLength === 0 || versionLength > MAX_VERSION_LENGTH) {
    throw new Error('Это не .pkg сцена Wallpaper Engine (неверный заголовок)');
  }
  const version = readExact(fd, versionLength, cursor).toString('utf8');
  cursor += versionLength;

  const fileCount = readUInt32();
  if (fileCount > MAX_FILE_COUNT) {
    throw new Error('Слишком много файлов в архиве: файл повреждён');
  }

  const files = [];
  for (let i = 0; i < fileCount; i++) {
    const nameLength = readUInt32();
    if (nameLength === 0 || nameLength > MAX_NAME_LENGTH) {
      throw new Error('Повреждено оглавление архива');
    }
    const name = readExact(fd, nameLength, cursor).toString('utf8');
    cursor += nameLength;
    const offset = readUInt32();
    const size = readUInt32();
    files.push({ name, offset, size });
  }

  return { version, files, dataStart: cursor };
}

module.exports = parsePkg;