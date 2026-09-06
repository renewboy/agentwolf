import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('.', import.meta.url))
const art = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(directory, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const temporary = mkdtempSync(join(tmpdir(), 'agentwolf-role-art-'))
const obsoleteFiles = []
const image = (...args) => execFileSync('magick', args, { maxBuffer: 24 * 1024 * 1024 })
const dimensions = (path) =>
  image('identify', '-format', '%w %h', path).toString().split(' ').map(Number)

// 对原图的朱砂印面换色；黑色刻痕、纸色线条、透明轮廓与头像圆口保持原始像素几何。
function pigment(input, output, color) {
  const [width, height] = dimensions(input)
  const pixels = image(input, '-depth', '8', 'rgba:-')
  const channels = color.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16))
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const [red, green, blue] = pixels.subarray(offset, offset + 3)
    if (red > green * 1.35 && red > blue * 1.3 && red - green > 6) {
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.min(255, Math.round((channels[channel] * red) / 126))
      }
    }
  }
  execFileSync(
    'magick',
    [
      '-size',
      `${width}x${height}`,
      '-depth',
      '8',
      'rgba:-',
      '-define',
      'webp:lossless=true',
      output,
    ],
    { input: pixels },
  )
}

function storeMaterial(role, name, input) {
  const bytes = readFileSync(input)
  const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
  const stem = name === 'horizontalTag' ? 'tag-horizontal' : name
  const relative = `${role.id}/${stem}-${fingerprint}.webp`
  writeFileSync(join(directory, relative), bytes)
  if (
    typeof role[name] === 'string' &&
    role[name] !== relative &&
    existsSync(join(directory, role[name]))
  ) {
    obsoleteFiles.push(join(directory, role[name]))
  }
  role[name] = relative
}

try {
  for (const role of manifest.roles) {
    const source = join(directory, role.id, 'source.png')
    if (role.id !== 'hidden') {
      const [width, height] = dimensions(source)
      const clean = join(temporary, 'alpha.png')
      const channels = image('identify', '-format', '%[channels]', source).toString()
      if (channels.includes('a')) copyFileSync(source, clean)
      else
        image(
          source,
          '-alpha',
          'on',
          '-channel',
          'A',
          '-fx',
          'a*(min(r,min(g,b))>0.79 && max(r,max(g,b))-min(r,min(g,b))<0.065 ? 0 : 1)',
          '+channel',
          clean,
        )
      const half = Math.floor(width / 2)
      for (const [name, x, partWidth, outputSize] of [
        ['tag', 0, half, '152x264!'],
        ['ribbon', half, width - half, '117x334!'],
      ]) {
        const part = join(temporary, 'part.png')
        const output = join(temporary, `${name}.webp`)
        image(clean, '-crop', `${partWidth}x${height}+${x}+0`, '+repage', part)
        const bounds = image(
          part,
          '-alpha',
          'extract',
          '-threshold',
          '80%',
          '-format',
          '%@',
          'info:',
        ).toString()
        image(
          part,
          '-crop',
          bounds,
          '+repage',
          '-channel',
          'A',
          '-fx',
          'a<0.25?0:a',
          '+channel',
          '-resize',
          outputSize,
          '-define',
          'webp:lossless=true',
          output,
        )
        storeMaterial(role, name, output)
      }
    } else {
      for (const [name, sourceName, outputSize] of [
        ['tag', 'council-role-tag.webp', '152x264!'],
        ['ribbon', 'council-seat-ribbon.webp', '117x334!'],
      ]) {
        const output = join(temporary, `${name}.webp`)
        pigment(join(art, sourceName), output, role.pigment)
        image(output, '-resize', outputSize, '-define', 'webp:lossless=true', output)
        storeMaterial(role, name, output)
      }
    }
    const horizontalTag = join(temporary, 'tag-horizontal.webp')
    image(
      join(directory, role.tag),
      '-rotate',
      '-90',
      '-define',
      'webp:lossless=true',
      horizontalTag,
    )
    storeMaterial(role, 'horizontalTag', horizontalTag)
    for (const [name, sourceName] of [
      ['avatar', 'council-avatar-frame.webp'],
      ['landscape', 'council-village.webp'],
    ]) {
      const output = join(temporary, `${name}.webp`)
      pigment(join(art, sourceName), output, role.pigment)
      storeMaterial(role, name, output)
    }
    process.stdout.write(`已导出 ${role.label}\n`)
  }
  const nextManifest = `${manifestPath}.next`
  writeFileSync(nextManifest, JSON.stringify(manifest, null, 2) + '\n')
  renameSync(nextManifest, manifestPath)
  const rules = manifest.roles
    .map(
      (role) =>
        `.aw-player-card[data-role-art='${role.id}'],\n.aw-role-badge[data-role-art='${role.id}'] {\n  --aw-player-role-tag: url('../../art/roles/${role.tag}');\n  --aw-role-tag-horizontal: url('../../art/roles/${role.horizontalTag}');\n  --aw-player-seat-ribbon: url('../../art/roles/${role.ribbon}');\n  --aw-player-landscape: url('../../art/roles/${role.landscape}');\n  --aw-player-role-ink: ${role.textColor};\n}`,
    )
    .join('\n\n')
  writeFileSync(
    join(art, '../styles/components/identity-materials.css'),
    `/* 由身份材质导出程序生成。 */\n${rules}\n`,
  )
  for (const path of obsoleteFiles) rmSync(path)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
