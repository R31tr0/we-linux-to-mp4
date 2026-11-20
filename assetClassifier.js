const fs = require('fs');

function classifyAssets(files, dataStart, fd) {
  const assets = {
    videos: [],
    textures: [],
    shaders: [],
    configs: [],
    audio: [],
    other: []
  };

  for (const currentFile of files) {
    const lowerName = currentFile.name.toLowerCase();
    const fileStart = dataStart + currentFile.offset;
    const fileEnd = fileStart + currentFile.size - 1;
    const assetInfo = {
      name: currentFile.name,
      start: fileStart,
      end: fileEnd,
      sizeMB: (currentFile.size / (1024 * 1024)).toFixed(2) + ' MB'
    };

    if (lowerName.endsWith('.mp4') || lowerName.endsWith('.webm')) {
      assets.videos.push(assetInfo);
    } else if (lowerName.endsWith('.tex')) {
      const probeSize = Math.min(512, currentFile.size);
      const headerBuffer = Buffer.alloc(probeSize);
      fs.readSync(fd, headerBuffer, 0, probeSize, fileStart);

      const ftypIndex = headerBuffer.indexOf('ftyp');

      if (ftypIndex >= 4) {
        assets.videos.push({
          name: currentFile.name.replace(/\.tex$/i, '.mp4'),
          start: fileStart + (ftypIndex - 4),
          end: fileEnd,
          sizeMB: assetInfo.sizeMB
        });
      } else {
        assets.textures.push(assetInfo);
      }
    } else if (
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg')
    ) {
      assets.textures.push(assetInfo);
    } else if (
      lowerName.endsWith('.vert') ||
      lowerName.endsWith('.frag') ||
      lowerName.endsWith('.hlsl')
    ) {
      assets.shaders.push(assetInfo);
    } else if (lowerName.endsWith('.json')) {
      assets.configs.push(assetInfo);
    } else if (
      lowerName.endsWith('.mp3') ||
      lowerName.endsWith('.wav') ||
      lowerName.endsWith('.ogg')
    ) {
      assets.audio.push(assetInfo);
    } else {
      assets.other.push(assetInfo);
    }
  }

  return assets;
}

module.exports = classifyAssets;
