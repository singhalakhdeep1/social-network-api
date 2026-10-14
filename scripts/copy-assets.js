// Copies non-TypeScript runtime assets into dist/ after `tsc` (the gRPC .proto definition).
const fs = require('fs');
const path = require('path');

const assets = [['src/grpc/service.proto', 'dist/grpc/service.proto']];
for (const [from, to] of assets) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}
