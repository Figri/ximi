// react-native-draggable-flatlist 4.0.3 在 web 重排后用视口坐标测量纵向单元格，
// 第二次拖动会把已滚动距离当成位移，甚至反向自动滚动。与库中横向补偿保持一致。
// 仅修复 JS 的 web 分支；Android/iOS 的原生测量保持原样。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'node_modules', 'react-native-draggable-flatlist');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (version !== '4.0.3') throw new Error(`请检查 draggable-flatlist ${version} 的滚动测量补丁后再升级`);
const variants = [
  ['src/components/CellRendererComponent.tsx', 'if (isWeb && horizontal) x += scrollOffset.value;', 'if (isWeb && !horizontal) y += scrollOffset.value;'],
  ['lib/module/components/CellRendererComponent.js', 'if (isWeb && horizontal) x += scrollOffset.value;', 'if (isWeb && !horizontal) y += scrollOffset.value;'],
  ['lib/commonjs/components/CellRendererComponent.js', 'if(_constants.isWeb&&horizontal)x+=scrollOffset.value;', 'if(_constants.isWeb&&!horizontal)y+=scrollOffset.value;'],
];
for (const [file, needle, addition] of variants) {
  const target = path.join(root, file), source = fs.readFileSync(target, 'utf8');
  if (source.includes(addition)) continue;
  if (!source.includes(needle)) throw new Error(`滚动测量补丁不匹配 ${file}`);
  fs.writeFileSync(target, source.replace(needle, `${needle}\n${addition}`));
}
console.log('draggable-flatlist web scroll measurement patch ready');
