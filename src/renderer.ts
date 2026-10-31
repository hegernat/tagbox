import { RunoffEngine } from './runoff';
import type { Dab, Point, Stroke } from './settings';

const fullscreenVertex = `#version 300 es
precision highp float;
out highp vec2 v_uv;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); v_uv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`;
const displayFragment = `#version 300 es
precision highp float;
in highp vec2 v_uv; out highp vec4 outColor; uniform highp sampler2D u_base;
void main(){ outColor=vec4(texture(u_base,v_uv).rgb,1.0); }`;
const dabVertex = `#version 300 es
precision highp float; precision highp int;
in highp vec3 a_dab; uniform highp vec2 u_targetSize; uniform highp vec2 u_scale; uniform highp float u_brushSize; uniform highp int u_shape; out highp float v_angle; out highp float v_brushSizePx; out highp float v_pointSize;
void main(){ vec2 p=a_dab.xy*u_scale; vec2 clip=p/u_targetSize*2.0-1.0; gl_Position=vec4(clip.x,-clip.y,0.0,1.0); v_angle=a_dab.z; v_brushSizePx=u_brushSize*u_scale.y; v_pointSize=max(1.0,v_brushSizePx*(u_shape==2?1.8:1.0)+(u_shape==1?2.0*u_scale.y:0.0)); gl_PointSize=v_pointSize; }`;
const baseFragment = `#version 300 es
precision highp float; precision highp int;
uniform highp vec3 u_color; uniform highp int u_shape; in highp float v_angle; in highp float v_brushSizePx; in highp float v_pointSize; out highp vec4 outColor;
void main(){ vec2 p=gl_PointCoord-vec2(0.5); float coverage=1.0; if(u_shape==0 && dot(p,p)>0.25) discard; if(u_shape==1){ vec2 pixel=p*v_pointSize; float edge=v_brushSizePx*0.5-max(abs(pixel.x),abs(pixel.y)); coverage=clamp(edge+0.5,0.0,1.0); if(coverage<=0.0) discard; } if(u_shape==2){ float c=cos(v_angle); float s=sin(v_angle); vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y); if((q.x*q.x)/(0.25)+(q.y*q.y)/(0.0378)>1.0) discard; } outColor=vec4(u_color,coverage); }`;
const runoffVertex = `#version 300 es
precision highp float;
in highp vec2 a_position; in highp vec3 a_color; uniform highp vec2 u_resolution; out highp vec3 v_color;
void main(){ vec2 p=a_position/u_resolution; gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0); v_color=a_color; }`;
const runoffFragment = `#version 300 es
precision highp float;
in highp vec3 v_color; out highp vec4 outColor;
void main(){ outColor=vec4(v_color,1.0); }`;

export class CanvasRenderer {
  private baseGl: WebGL2RenderingContext;
  private baseProgram: WebGLProgram;
  private displayProgram: WebGLProgram;
  private runoffProgram: WebGLProgram;
  private baseVao: WebGLVertexArrayObject;
  private runoffVao: WebGLVertexArrayObject;
  private dabBuffer: WebGLBuffer;
  private readonly runoffGpuCache = new Map<Stroke, { buffer: WebGLBuffer; geometry: Float32Array }>();
  private baseTexture: WebGLTexture;
  private baseFramebuffer: WebGLFramebuffer;
  private strokes: Stroke[] = [];
  private active: Stroke | null = null;
  private width = 1;
  private height = 1;
  private runoffEngine = new RunoffEngine();
  private raf = 0;
  private renderRaf = 0;
  private lastFrame = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly runoffCanvas: HTMLCanvasElement) {
    const baseGl = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!baseGl) throw new Error('WebGL2 is not available in this browser.');
    this.baseGl = baseGl;
    this.baseProgram = this.createProgram(baseGl, dabVertex, baseFragment, 'brush dab');
    this.displayProgram = this.createProgram(baseGl, fullscreenVertex, displayFragment, 'canvas display');
    this.runoffProgram = this.createProgram(baseGl, runoffVertex, runoffFragment, 'runoff');
    const baseVao = baseGl.createVertexArray();
    const runoffVao = baseGl.createVertexArray();
    const dabBuffer = baseGl.createBuffer();
    if (!baseVao || !runoffVao || !dabBuffer) throw new Error('Could not create canvas render resources.');
    this.baseVao = baseVao;
    this.runoffVao = runoffVao;
    this.dabBuffer = dabBuffer;
    this.baseTexture = this.createTexture(baseGl);
    this.baseFramebuffer = this.createFramebuffer(baseGl, this.baseTexture);
    baseGl.bindVertexArray(baseVao);
    baseGl.bindVertexArray(runoffVao);
    baseGl.disable(baseGl.BLEND);
    this.resize(1, 1, 1);
  }

  private compile(gl: WebGL2RenderingContext, type: number, source: string, stage: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`WebGL could not allocate the ${stage} shader.`);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || '(compiler returned no diagnostic log)';
      gl.deleteShader(shader);
      throw new Error(`WebGL ${stage} shader compilation failed.\n${log}\nShader source:\n${this.numberedSource(source)}`);
    }
    return shader;
  }

  private createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string, label: string): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error(`WebGL could not allocate the ${label} program.`);
    let vertexShader: WebGLShader | null = null;
    let fragmentShader: WebGLShader | null = null;
    try {
      vertexShader = this.compile(gl, gl.VERTEX_SHADER, vertex, `${label} vertex`);
      fragmentShader = this.compile(gl, gl.FRAGMENT_SHADER, fragment, `${label} fragment`);
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) || '(linker returned no diagnostic log)';
        throw new Error(`WebGL ${label} program link failed.\n${log}`);
      }
      return program;
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
    }
  }

  private numberedSource(source: string): string {
    return source.split('\n').map((line, index) => `${String(index + 1).padStart(3, ' ')}: ${line}`).join('\n');
  }

  private createTexture(gl: WebGL2RenderingContext): WebGLTexture {
    const texture = gl.createTexture();
    if (!texture) throw new Error('Could not create base layer texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private createFramebuffer(gl: WebGL2RenderingContext, texture: WebGLTexture): WebGLFramebuffer {
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('Could not create base layer framebuffer.');
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return framebuffer;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(width, 1); this.height = Math.max(height, 1);
    const backingWidth = Math.max(1, Math.round(width * dpr));
    const backingHeight = Math.max(1, Math.round(height * dpr));
    this.canvas.width = backingWidth; this.canvas.height = backingHeight;
    this.runoffCanvas.width = backingWidth; this.runoffCanvas.height = backingHeight;
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    this.runoffCanvas.style.width = `${width}px`; this.runoffCanvas.style.height = `${height}px`;
    const gl = this.baseGl;
    gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, backingWidth, backingHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.replayBase();
    this.startRunoffAnimation();
  }

  setRunIntensity(value: number): void { this.runoffEngine.setIntensity(value); }

  setActive(stroke: Stroke | null, newDabs: Dab[] = []): void {
    this.active = stroke;
    if (!newDabs.length || !stroke) return;
    this.runoffEngine.addDabs(stroke, newDabs, performance.now(), this.height);
    // Always queue visible stroke updates independently of the runoff animation loop.
    // The animation may already have a frame pending, but it is not responsible for
    // presenting newly received pointer dabs.
    this.scheduleRender();
  }

  commitStroke(stroke: Stroke): void {
    if (this.strokes.at(-1) !== stroke) this.strokes.push(stroke);
    this.active = null;
  }

  setStrokes(strokes: Stroke[]): void {
    this.strokes = [...strokes];
    const retained = this.active ? [...this.strokes, this.active] : this.strokes;
    this.runoffEngine.retain(retained);
    const keep = new Set(retained);
    for (const [stroke, cached] of this.runoffGpuCache) if (!keep.has(stroke)) {
      this.baseGl.deleteBuffer(cached.buffer);
      this.runoffGpuCache.delete(stroke);
    }
    this.replayBase();
    this.startRunoffAnimation();
  }

  clear(): void {
    this.strokes = []; this.active = null; this.runoffEngine.clear();
    for (const cached of this.runoffGpuCache.values()) this.baseGl.deleteBuffer(cached.buffer);
    this.runoffGpuCache.clear();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.renderRaf) cancelAnimationFrame(this.renderRaf);
    this.raf = 0; this.renderRaf = 0; this.lastFrame = 0;
    this.clearBase(); this.presentBase();
  }

  private clearBase(): void {
    const gl = this.baseGl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.baseFramebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private replayBase(): void {
    this.clearBase();
    for (const stroke of this.strokes) {
      this.drawBaseDabs(stroke.dabs, stroke);
      this.drawRunoffs(stroke);
    }
    if (this.active) {
      this.drawBaseDabs(this.active.dabs, this.active);
      this.drawRunoffs(this.active);
    }
    this.presentBase();
  }

  private scheduleRender(): void {
    if (this.renderRaf) return;
    this.renderRaf = requestAnimationFrame(() => {
      this.renderRaf = 0;
      this.replayBase();
      this.startRunoffAnimation();
    });
  }

  private drawBaseDabs(dabs: Dab[], stroke: Stroke): void {
    if (!dabs.length) return;
    const gl = this.baseGl;
    const first = dabs[0];
    const vertices = new Float32Array(dabs.length * 3);
    dabs.forEach((dab, index) => vertices.set([dab.x, dab.y, dab.angle], index * 3));
    gl.bindVertexArray(this.baseVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.baseFramebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.baseProgram);
    gl.uniform2f(gl.getUniformLocation(this.baseProgram, 'u_targetSize'), this.canvas.width, this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(this.baseProgram, 'u_scale'), this.canvas.width / this.width, this.canvas.height / this.height);
    gl.uniform1f(gl.getUniformLocation(this.baseProgram, 'u_brushSize'), first.size);
    gl.uniform1i(gl.getUniformLocation(this.baseProgram, 'u_shape'), stroke.shape === 'round' ? 0 : stroke.shape === 'square' ? 1 : 2);
    gl.uniform3fv(gl.getUniformLocation(this.baseProgram, 'u_color'), this.parseColor(first.color));
    const attribute = gl.getAttribLocation(this.baseProgram, 'a_dab');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 12, 0);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, dabs.length);
    gl.disable(gl.BLEND);
  }

  private drawRunoffs(stroke: Stroke): void {
    const geometry = this.runoffEngine.geometry(stroke);
    if (!geometry.length) return;
    const gl = this.baseGl;
    gl.useProgram(this.runoffProgram);
    gl.uniform2f(gl.getUniformLocation(this.runoffProgram, 'u_resolution'), this.width, this.height);
    gl.bindVertexArray(this.runoffVao);
    let cached = this.runoffGpuCache.get(stroke);
    if (!cached) {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('Could not allocate runoff geometry buffer.');
      cached = { buffer, geometry };
      this.runoffGpuCache.set(stroke, cached);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
    } else if (cached.geometry !== geometry) {
      cached.geometry = geometry;
      gl.bindBuffer(gl.ARRAY_BUFFER, cached.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, cached.buffer);
    const position = gl.getAttribLocation(this.runoffProgram, 'a_position');
    const color = gl.getAttribLocation(this.runoffProgram, 'a_color');
    gl.enableVertexAttribArray(position); gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 20, 8);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, geometry.length / 5);
  }

  private startRunoffAnimation(): void {
    if (!this.runoffEngine.hasGrowingRuns() || this.raf) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.animateRunoffs);
  }

  private animateRunoffs = (now: number): void => {
    this.raf = 0;
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    this.runoffEngine.advance(dt);
    this.replayBase();
    if (this.runoffEngine.hasGrowingRuns()) this.raf = requestAnimationFrame(this.animateRunoffs);
  };

  private presentBase(): void {
    const gl = this.baseGl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.displayProgram);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
    gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'u_base'), 0);
    gl.bindVertexArray(this.baseVao); gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private parseColor(hex: string): [number, number, number] {
    const normalized = hex.replace('#', '');
    return [parseInt(normalized.slice(0, 2), 16) / 255, parseInt(normalized.slice(2, 4), 16) / 255, parseInt(normalized.slice(4, 6), 16) / 255];
  }
}

export function pointerPosition(event: PointerEvent, canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}
