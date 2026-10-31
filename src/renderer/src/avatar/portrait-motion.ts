import type { PortraitMotion } from '../../../shared/standrig-avatar'

const vertex = `attribute vec2 position;
varying vec2 uv;
void main() { uv = (position + 1.0) * .5; gl_Position = vec4(position, 0., 1.); }`
const fragment = `precision mediump float;
varying vec2 uv;
uniform sampler2D image;
uniform vec2 size;
uniform vec4 head;
uniform vec2 pivot;
uniform vec4 leftEye;
uniform vec4 rightEye;
uniform vec2 gaze;
uniform vec2 turn;
uniform float tilt;
uniform float breath;
uniform float sway;
float maskAt(vec2 p, vec4 region) {
  return 1. - smoothstep(.3, 1., length((p - region.xy) / max(region.zw, vec2(.001))));
}
void main() {
  vec2 p = vec2(uv.x, 1. - uv.y) * size;
  p.y += breath;
  p.x -= sway * (1. - p.y / size.y);
  float weight = maskAt(p, head);
  vec2 d = p - pivot;
  float a = -tilt * weight;
  p = pivot + mat2(cos(a), sin(a), -sin(a), cos(a)) * d - turn * weight;
  // Local image warps preserve the eye boundary; closed-eye artwork has no eye anchors.
  vec2 original = p;
  p -= gaze * max(maskAt(original, leftEye), maskAt(original, rightEye));
  vec2 sampleUV = vec2(p.x / size.x, p.y / size.y);
  if (sampleUV.x < 0. || sampleUV.y < 0. || sampleUV.x > 1. || sampleUV.y > 1.) gl_FragColor = vec4(0.);
  else gl_FragColor = texture2D(image, sampleUV);
}`

/** Optional image-space motion, explicitly authored per portrait; never synthesizes a mouth. */
export function createPortraitMotion(width: number, height: number, binding: PortraitMotion): {
  canvas: HTMLCanvasElement
  upload(source: HTMLCanvasElement): void
  render(params: Record<string, number>, expression: string): void
  dispose(): void
} {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false })
  if (!gl) throw Error('这台设备无法创建立绘动作画布。')
  const program = gl.createProgram()!, shaders: WebGLShader[] = []
  const buffer = gl.createBuffer()!, texture = gl.createTexture()!
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type)!; shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('立绘动作着色器编译失败。')
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('立绘动作着色器链接失败。')
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.uniform1i(gl.getUniformLocation(program, 'image'), 0)
    gl.uniform2f(gl.getUniformLocation(program, 'size'), width, height)
    const h = binding.head
    gl.uniform4f(gl.getUniformLocation(program, 'head'), h.x, h.y, h.radiusX, h.radiusY)
    gl.uniform2f(gl.getUniformLocation(program, 'pivot'), h.pivotX, h.pivotY)
    const uniforms = Object.fromEntries(['leftEye', 'rightEye', 'gaze', 'turn', 'tilt', 'breath', 'sway'].map(key => [key, gl.getUniformLocation(program, key)]))
    const clamp = (n: number | undefined): number => Number.isFinite(n) ? Math.max(-1, Math.min(1, n!)) : 0
    return {
      canvas,
      upload(source) { gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source) },
      render(params, expression) {
        if (gl.isContextLost()) throw Error('立绘动作画布已丢失，请重新载入角色。')
        const eyes = binding.eyes[expression] ?? []
        for (const [i, name] of ['leftEye', 'rightEye'].entries()) { const eye = eyes[i]; gl.uniform4f(uniforms[name], eye?.x ?? -100, eye?.y ?? -100, eye?.radiusX ?? 1, eye?.radiusY ?? 1) }
        gl.uniform2f(uniforms.gaze, clamp(params.eyeX) * 4, -clamp(params.eyeY) * 3)
        gl.uniform2f(uniforms.turn, clamp(params.angleX) * 17, -clamp(params.angleY) * 12)
        gl.uniform1f(uniforms.tilt, clamp(params.angleZ) * .07)
        gl.uniform1f(uniforms.breath, Math.max(0, clamp(params.breath)) * 3)
        gl.uniform1f(uniforms.sway, clamp(params.body) * 15)
        gl.viewport(0, 0, width, height); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      },
      dispose() { gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader)); gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.width = canvas.height = 1 }
    }
  } catch (error) { gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader)); gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error }
}
