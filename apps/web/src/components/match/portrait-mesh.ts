import type { CharacterPerformance } from '@agentwolf/assets'
import { PortraitDeformation } from './portrait-deformation.js'
import { PortraitFace } from './portrait-face.js'

const vertex = `precision highp float;
attribute vec2 a_position;
attribute vec2 a_uv;
uniform vec2 u_size;
varying vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = vec4(a_position.x/u_size.x*2.-1., 1.-a_position.y/u_size.y*2., 0., 1.); }`
const fragment = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_base;
uniform sampler2D u_face;
uniform vec2 u_size;
uniform vec4 u_face_bounds;
void main() {
  vec2 faceUV = (v_uv*u_size-u_face_bounds.xy)/u_face_bounds.zw;
  if (faceUV.x >= 0. && faceUV.x <= 1. && faceUV.y >= 0. && faceUV.y <= 1.)
    gl_FragColor = texture2D(u_face,faceUV);
  else gl_FragColor = texture2D(u_base,v_uv);
}`

export class PortraitMesh {
  readonly #gl: WebGLRenderingContext
  readonly #program: WebGLProgram
  readonly #deformation: PortraitDeformation
  readonly #facial: PortraitFace
  readonly #buffer: WebGLBuffer
  readonly #indexBuffer: WebGLBuffer
  readonly #textures: WebGLTexture[] = []

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    rig: CharacterPerformance,
    images: readonly HTMLImageElement[],
  ) {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    })
    if (!gl) throw new Error('Portrait graphics unavailable')
    this.#gl = gl
    const shaders: WebGLShader[] = []
    const program = gl.createProgram()!
    this.#program = program
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)
        shaders.forEach((value) => gl.deleteShader(value))
        gl.deleteProgram(program)
        throw new Error('Portrait shader unavailable')
      }
      gl.attachShader(program, shader)
      shaders.push(shader)
    }
    gl.linkProgram(program)
    shaders.forEach((shader) => gl.deleteShader(shader))
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      throw new Error('Portrait program unavailable')
    }
    try {
      this.#facial = new PortraitFace(rig, images[0]!)
    } catch (error) {
      gl.deleteProgram(program)
      throw error
    }
    this.#deformation = new PortraitDeformation(rig)
    gl.useProgram(program)
    this.#buffer = gl.createBuffer()!
    this.#indexBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.#deformation.vertices, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.#deformation.indices, gl.STATIC_DRAW)
    for (const [name, offset] of [
      ['a_position', 0],
      ['a_uv', 8],
    ] as const) {
      const location = gl.getAttribLocation(program, name)
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 16, offset)
    }
    ;[images[0]!, this.#facial.canvas].forEach((source, index) => {
      const texture = gl.createTexture()!
      this.#textures.push(texture)
      gl.activeTexture(gl.TEXTURE0 + index)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      gl.uniform1i(gl.getUniformLocation(program, index === 0 ? 'u_base' : 'u_face'), index)
    })
    gl.uniform2f(gl.getUniformLocation(program, 'u_size'), rig.width, rig.height)
    gl.uniform4fv(gl.getUniformLocation(program, 'u_face_bounds'), rig.face.bounds)
    gl.clearColor(0, 0, 0, 0)
  }

  public draw(time: number, delta: number, level: number): void {
    const gl = this.#gl
    if (gl.isContextLost()) return
    this.#deformation.step(time, delta, level)
    this.#facial.draw(
      this.#deformation.acting.eyes,
      this.#deformation.mouth,
      this.#deformation.acting.cue,
    )
    gl.activeTexture(gl.TEXTURE0 + 1)
    gl.bindTexture(gl.TEXTURE_2D, this.#textures[1]!)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.#facial.canvas)
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.#deformation.vertices)
    gl.drawElements(gl.TRIANGLES, this.#deformation.indices.length, gl.UNSIGNED_SHORT, 0)
  }

  public dispose(): void {
    const gl = this.#gl
    this.#textures.forEach((texture) => gl.deleteTexture(texture))
    gl.deleteBuffer(this.#buffer)
    gl.deleteBuffer(this.#indexBuffer)
    gl.deleteProgram(this.#program)
    if (!this.canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
