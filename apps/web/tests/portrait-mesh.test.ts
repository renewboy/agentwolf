import { describe, expect, it, vi } from 'vitest'
import { builtInCharacterCards, characterPerformance } from '@agentwolf/assets'
import { PortraitDeformation } from '../src/components/match/portrait-deformation.js'
import { PortraitMesh } from '../src/components/match/portrait-mesh.js'

const faceDraw = vi.hoisted(() => vi.fn())
vi.mock('../src/components/match/portrait-face.js', () => ({
  PortraitFace: class {
    canvas = {}
    draw = faceDraw
  },
}))

function graphics() {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    ELEMENT_ARRAY_BUFFER: 6,
    DYNAMIC_DRAW: 7,
    STATIC_DRAW: 8,
    FLOAT: 9,
    TEXTURE0: 10,
    TEXTURE_2D: 11,
    TEXTURE_WRAP_S: 12,
    TEXTURE_WRAP_T: 13,
    CLAMP_TO_EDGE: 14,
    TEXTURE_MIN_FILTER: 15,
    TEXTURE_MAG_FILTER: 16,
    LINEAR: 17,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 18,
    RGBA: 19,
    UNSIGNED_BYTE: 20,
    COLOR_BUFFER_BIT: 21,
    TRIANGLES: 22,
    UNSIGNED_SHORT: 23,
    drawingBufferWidth: 400,
    drawingBufferHeight: 600,
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createTexture: vi.fn(() => ({})),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    uniform1i: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    uniform2f: vi.fn(),
    uniform4fv: vi.fn(),
    clearColor: vi.fn(),
    isContextLost: vi.fn(() => false),
    viewport: vi.fn(),
    clear: vi.fn(),
    bufferSubData: vi.fn(),
    drawElements: vi.fn(),
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
  }
  const canvas = { getContext: vi.fn(() => gl) } as unknown as HTMLCanvasElement
  return { gl, canvas }
}
const rig = characterPerformance(builtInCharacterCards.find((card) => card.id === 'character-gin'))!
describe('portrait mesh', () => {
  it('keeps the context usable across an effect cleanup on a connected canvas', () => {
    const { gl, canvas } = graphics()
    Object.defineProperty(canvas, 'isConnected', { configurable: true, value: true })
    new PortraitMesh(canvas, rig, []).dispose()
    expect(gl.getExtension).not.toHaveBeenCalled()
    const replacement = new PortraitMesh(canvas, rig, [])
    Object.defineProperty(canvas, 'isConnected', { value: false })
    replacement.dispose()
    expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context')
  })
  it('uploads a procedural face surface, skips lost contexts and releases its resources', () => {
    const { gl, canvas } = graphics()
    const mesh = new PortraitMesh(canvas, rig, [{}] as HTMLImageElement[])
    for (let frame = 1; frame < 60; frame++) mesh.draw(frame / 30, 1 / 30, 0.12)
    const speaking = faceDraw.mock.calls.at(-1)![1]
    for (let frame = 0; frame < 20; frame++) mesh.draw(2 + frame / 30, 1 / 30, 0)
    expect(faceDraw.mock.calls.at(-1)![1]).toBeLessThan(Number(speaking) / 10)
    expect(gl.texSubImage2D).toHaveBeenCalled()
    gl.isContextLost.mockReturnValue(true)
    const count = gl.drawElements.mock.calls.length
    mesh.draw(3, 0.03, 0.2)
    expect(gl.drawElements).toHaveBeenCalledTimes(count)
    mesh.dispose()
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2)
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2)
    expect(gl.deleteProgram).toHaveBeenCalledOnce()
  })
  it('keeps UVs, local topology, the face and grip fixed while cloth and hair move without folded triangles', () => {
    const mesh = new PortraitDeformation(rig)
    const original = mesh.vertices.slice(),
      topology = mesh.indices.slice()
    const moved = { hair: 0, shoulder: 0, sleeve: 0, lapel: 0 }
    for (let frame = 0; frame < 300; frame++) {
      mesh.step(frame / 30, 1 / 30, frame < 150 ? 0.15 : 0)
      for (let index = 0; index < original.length; index += 4) {
        const x = original[index]!,
          y = original[index + 1]!,
          change = Math.hypot(mesh.vertices[index]! - x, mesh.vertices[index + 1]! - y)
        if (
          y < 275 ||
          (x > 440 && x < 600 && y > 360 && y < 460) ||
          (x > 640 && x < 750 && y > 1110 && y < 1190)
        ) {
          if (change !== 0) throw new Error('Pinned region moved')
        }
        if (x > 180 && x < 260 && y > 500 && y < 610) moved.hair = Math.max(moved.hair, change)
        if (x > 150 && x < 280 && y > 660 && y < 750)
          moved.shoulder = Math.max(moved.shoulder, change)
        if (x > 110 && x < 180 && y > 1150 && y < 1290)
          moved.sleeve = Math.max(moved.sleeve, change)
        if (x > 440 && x < 500 && y > 770 && y < 840) moved.lapel = Math.max(moved.lapel, change)
        if (
          mesh.vertices[index + 2] !== original[index + 2] ||
          mesh.vertices[index + 3] !== original[index + 3]
        )
          throw new Error('Texture coordinates changed')
      }
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const a = mesh.indices[i]! * 4,
          b = mesh.indices[i + 1]! * 4,
          c = mesh.indices[i + 2]! * 4,
          v = mesh.vertices
        const area =
          (v[b]! - v[a]!) * (v[c + 1]! - v[a + 1]!) - (v[b + 1]! - v[a + 1]!) * (v[c]! - v[a]!)
        if (area < 100 || area > 450) throw new Error('Portrait triangle folded or stretched')
      }
    }
    expect(mesh.indices).toEqual(topology)
    for (const amount of Object.values(moved)) expect(amount).toBeGreaterThan(3)
    expect(mesh.mouth).toBeLessThan(0.001)
  })
  it('reports unavailable graphics and releases failed shaders', () => {
    const { gl, canvas } = graphics()
    gl.getShaderParameter.mockReturnValue(false)
    expect(() => new PortraitMesh(canvas, rig, [])).toThrow('shader')
    expect(gl.deleteProgram).toHaveBeenCalledOnce()
    gl.getShaderParameter.mockReturnValue(true)
    gl.getProgramParameter.mockReturnValue(false)
    expect(() => new PortraitMesh(canvas, rig, [])).toThrow('program')
    expect(() => new PortraitMesh({ getContext: () => null } as never, rig, [])).toThrow('graphics')
  })
})
