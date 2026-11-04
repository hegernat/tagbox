import { RunoffEngine } from './runoff';
import type { Dab, Material, Point, Stroke } from './settings';

type ChromeMaterial = Exclude<Material, 'paint'>;
const chromeMaterials: ChromeMaterial[] = ['silver-chrome', 'copper-chrome', 'gold-chrome'];
const fullscreenVertex = `#version 300 es
precision highp float;
out highp vec2 v_uv;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); v_uv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`;
const displayFragment = `#version 300 es
precision highp float;
in highp vec2 v_uv; out highp vec4 outColor; uniform highp sampler2D u_base;
void main(){ outColor=vec4(texture(u_base,v_uv).rgb,1.0); }`;
const chromeFragment = `#version 300 es
precision highp float;
in highp vec2 v_uv; uniform highp sampler2D u_silverMask; uniform highp sampler2D u_copperMask; uniform highp sampler2D u_goldMask; out highp vec4 outColor;
void main(){
  float silver=texture(u_silverMask,v_uv).a;
  float copper=texture(u_copperMask,v_uv).a;
  float gold=texture(u_goldMask,v_uv).a;
  float coverage=1.0-(1.0-silver)*(1.0-copper)*(1.0-gold);
  if(coverage<=0.001) discard;
  float tintWeight=max(silver+copper+gold,0.001);
  vec3 tint=(silver*vec3(0.72,0.76,0.80)+copper*vec3(0.64,0.30,0.16)+gold*vec3(0.78,0.57,0.16))/tintWeight;
  vec3 reflectionTint=(silver*vec3(1.0,1.0,1.0)+copper*vec3(1.0,0.74,0.53)+gold*vec3(1.0,0.87,0.52))/tintWeight;
  vec2 uv=vec2(v_uv.x,1.0-v_uv.y);
  float band=0.28+0.17*smoothstep(0.02,0.42,sin(uv.y*6.283)*0.5+0.5)+0.13*smoothstep(0.34,0.72,sin(uv.y*12.566+0.7)*0.5+0.5)+0.012*sin(uv.y*18.85+uv.x*2.2);
  float key=exp(-pow((uv.x-0.22)/0.16,2.0))*smoothstep(0.06,0.23,uv.y)*(1.0-smoothstep(0.72,0.94,uv.y));
  float strip=exp(-pow((uv.x-0.72)/0.11,2.0))*smoothstep(0.10,0.29,uv.y)*(1.0-smoothstep(0.58,0.82,uv.y));
  float box=exp(-pow((uv.x-0.48)/0.23,2.0)-pow((uv.y-0.13)/0.15,2.0));
  float studio=exp(-pow((uv.x-0.36)/0.035,2.0))*(0.62+0.38*sin(uv.y*5.1+0.6)*0.5+0.19);
  float softbox=exp(-pow((uv.x-0.12)/0.022,2.0))*(0.68+0.32*sin(uv.y*4.4+0.8)*0.5+0.16);
  float stripLight=exp(-pow((uv.x-0.59)/0.018,2.0))*(0.58+0.42*smoothstep(0.1,0.86,sin(uv.y*6.8+uv.x*1.7)*0.5+0.5));
  float value=clamp(band+0.30*key+0.24*strip+0.18*box+0.12*studio+0.12*softbox+0.11*stripLight,0.24,1.15);
  float reflectionLevel=smoothstep(0.24,0.84,value);
  vec3 body=tint*(0.10+0.64*value);
  vec3 color=mix(body,reflectionTint*value,0.82*reflectionLevel);
  outColor=vec4(color,coverage);
}`;
const dabVertex = `#version 300 es
precision highp float; precision highp int;
in highp vec3 a_dab; uniform highp vec2 u_targetSize; uniform highp vec2 u_scale; uniform highp float u_brushSize; uniform highp int u_shape; out highp float v_angle; out highp float v_brushSizePx; out highp float v_pointSize; out highp vec2 v_world;
void main(){ vec2 p=a_dab.xy*u_scale; vec2 clip=p/u_targetSize*2.0-1.0; gl_Position=vec4(clip.x,-clip.y,0.0,1.0); v_world=p; v_angle=a_dab.z; v_brushSizePx=u_brushSize*u_scale.y; float c=abs(cos(a_dab.z)); float s=abs(sin(a_dab.z)); float extent=(u_shape==2||u_shape==3)?1.8:u_shape==1?c+s:1.0; float pointSize=max(1.0,v_brushSizePx*extent+(u_shape==1?2.0*u_scale.y:0.0)); gl_PointSize=pointSize; v_pointSize=pointSize; }`;
const baseFragment = `#version 300 es
precision highp float; precision highp int;
uniform highp vec3 u_color; uniform highp int u_shape; uniform highp int u_maskOnly; in highp float v_angle; in highp float v_brushSizePx; in highp float v_pointSize; out highp vec4 outColor;
void main(){ vec2 p=gl_PointCoord-vec2(0.5); float coverage=1.0; if(u_shape==0 && dot(p,p)>0.25) discard; if(u_shape!=0){ float c=cos(v_angle); float s=sin(v_angle); vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y); if(u_shape==1){ vec2 pixel=q*v_pointSize; float edge=v_brushSizePx*0.5-max(abs(pixel.x),abs(pixel.y)); coverage=clamp(edge+0.5,0.0,1.0); if(coverage<=0.0) discard; } else if(u_shape==2){ if((q.x*q.x)/(0.25)+(q.y*q.y)/(0.0378)>1.0) discard; } else { bool inShortSegment=q.x>=-0.5 && q.x<=-0.2; bool inLongSegment=q.x>=-0.1 && q.x<=0.5; if(abs(q.y)>0.1722222 || !(inShortSegment || inLongSegment)) discard; } } outColor=vec4(u_maskOnly==1?vec3(1.0):u_color,coverage); }`;
const runoffVertex = `#version 300 es
precision highp float;
in highp vec2 a_position; in highp vec3 a_color; uniform highp vec2 u_resolution; out highp vec3 v_color; out highp vec2 v_world;
void main(){ vec2 p=a_position/u_resolution; gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0); v_color=a_color; v_world=p; }`;
const runoffFragment = `#version 300 es
precision highp float;
in highp vec3 v_color; uniform highp int u_maskOnly; out highp vec4 outColor;
void main(){ outColor=u_maskOnly==1?vec4(1.0):vec4(v_color,1.0); }`;

export class CanvasRenderer {
  private baseGl: WebGL2RenderingContext;
  private baseProgram: WebGLProgram;
  private displayProgram: WebGLProgram;
  private chromeProgram: WebGLProgram;
  private runoffProgram: WebGLProgram;
  private baseVao: WebGLVertexArrayObject;
  private runoffVao: WebGLVertexArrayObject;
  private dabBuffer: WebGLBuffer;
  private readonly runoffGpuCache = new Map<object, { buffer: WebGLBuffer; geometry: Float32Array }>();
  private baseTexture: WebGLTexture;
  private baseFramebuffer: WebGLFramebuffer;
  private chromeMasks!: Record<ChromeMaterial, { texture: WebGLTexture; framebuffer: WebGLFramebuffer }>;
  private strokes: Stroke[] = [];
  private active: Stroke | null = null;
  private incrementallyRenderedStroke: Stroke | null = null;
  private incrementallyRenderedDabCount = 0;
  private width = 1;
  private height = 1;
  private runoffEngine = new RunoffEngine();
  private raf = 0;
  private renderRaf = 0;
  private renderReplayRequired = false;
  private lastFrame = 0;
  private backgroundColor = '#000000';

  constructor(private readonly canvas: HTMLCanvasElement, private readonly runoffCanvas: HTMLCanvasElement) {
    const baseGl = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!baseGl) throw new Error('WebGL2 is not available in this browser.');
    this.baseGl = baseGl;
    this.baseProgram = this.createProgram(baseGl, dabVertex, baseFragment, 'brush dab');
    this.displayProgram = this.createProgram(baseGl, fullscreenVertex, displayFragment, 'canvas display');
    this.chromeProgram = this.createProgram(baseGl, fullscreenVertex, chromeFragment, 'chrome composite');
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
    this.chromeMasks = Object.fromEntries(chromeMaterials.map((material) => {
      const texture = this.createTexture(baseGl);
      return [material, { texture, framebuffer: this.createFramebuffer(baseGl, texture) }];
    })) as Record<ChromeMaterial, { texture: WebGLTexture; framebuffer: WebGLFramebuffer }>;
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

  resize(width: number, height: number, dpr: number, displayWidth = width, displayHeight = height): void {
    this.width = Math.max(width, 1); this.height = Math.max(height, 1);
    const backingWidth = Math.max(1, Math.round(width * dpr));
    const backingHeight = Math.max(1, Math.round(height * dpr));
    this.canvas.width = backingWidth; this.canvas.height = backingHeight;
    this.runoffCanvas.width = backingWidth; this.runoffCanvas.height = backingHeight;
    this.canvas.style.width = `${displayWidth}px`; this.canvas.style.height = `${displayHeight}px`;
    this.runoffCanvas.style.width = `${displayWidth}px`; this.runoffCanvas.style.height = `${displayHeight}px`;
    const gl = this.baseGl;
    gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, backingWidth, backingHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const { texture } of Object.values(this.chromeMasks)) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, backingWidth, backingHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    this.replayBase();
    this.startRunoffAnimation();
  }

  setRunIntensity(value: number): void { this.runoffEngine.setIntensity(value); }

  setBackgroundColor(color: string): void {
    this.backgroundColor = color;
    this.replayBase();
  }

  setActive(stroke: Stroke | null, newDabs: Dab[] = []): void {
    this.active = stroke;
    if (this.incrementallyRenderedStroke !== stroke) {
      this.incrementallyRenderedStroke = stroke?.material === 'paint' ? stroke : null;
      this.incrementallyRenderedDabCount = 0;
    }
    if (!newDabs.length || !stroke) return;
    this.runoffEngine.addDabs(stroke, newDabs, performance.now(), this.width, this.height);
    if (stroke.material === 'paint') {
      // Draw only the dabs delivered in this batch; prior active dabs are already in the base.
      const batchStart = stroke.dabs.length - newDabs.length;
      const alreadyRenderedInBatch = Math.max(0, this.incrementallyRenderedDabCount - batchStart);
      const dabsToRender = newDabs.slice(alreadyRenderedInBatch);
      if (dabsToRender.length) this.drawBaseDabs(dabsToRender, stroke);
      this.incrementallyRenderedStroke = stroke;
      this.incrementallyRenderedDabCount = Math.max(this.incrementallyRenderedDabCount, stroke.dabs.length);
      this.scheduleRender(false);
    } else {
      this.scheduleRender(true);
    }
  }

  commitStroke(stroke: Stroke): void {
    if (this.strokes.at(-1) !== stroke) this.strokes.push(stroke);
    this.active = null;
    this.incrementallyRenderedStroke = null;
    this.incrementallyRenderedDabCount = 0;
  }

  setStrokes(strokes: Stroke[]): void {
    this.strokes = [...strokes];
    const retained = this.active ? [...this.strokes, this.active] : this.strokes;
    const keep = this.runoffEngine.retain(retained);
    for (const [component, cached] of this.runoffGpuCache) if (!keep.has(component)) {
      this.baseGl.deleteBuffer(cached.buffer);
      this.runoffGpuCache.delete(component);
    }
    this.replayBase();
    this.startRunoffAnimation();
  }

  clear(): void {
    this.strokes = []; this.active = null; this.runoffEngine.clear();
    this.incrementallyRenderedStroke = null;
    this.incrementallyRenderedDabCount = 0;
    this.renderReplayRequired = false;
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
    gl.clearColor(...this.parseColor(this.backgroundColor), 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private replayBase(): void {
    this.clearBase();
    let chromeBatch = false;
    const drawStroke = (stroke: Stroke): void => {
      if (stroke.material !== 'paint') {
        if (!chromeBatch) {
          chromeBatch = true;
          this.clearChromeMasks();
        }
        this.drawBaseDabs(stroke.dabs, stroke, true);
        this.drawRunoffs(stroke, true);
        return;
      }
      if (chromeBatch) { this.compositeChrome(); chromeBatch = false; }
      this.drawBaseDabs(stroke.dabs, stroke);
      this.drawRunoffs(stroke);
    };
    for (const stroke of this.strokes) drawStroke(stroke);
    if (this.active) drawStroke(this.active);
    if (chromeBatch) this.compositeChrome();
    this.presentBase();
    this.incrementallyRenderedStroke = this.active?.material === 'paint' ? this.active : null;
    this.incrementallyRenderedDabCount = this.incrementallyRenderedStroke?.dabs.length ?? 0;
  }

  private clearChromeMasks(): void {
    const gl = this.baseGl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    for (const { framebuffer } of Object.values(this.chromeMasks)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  private compositeChrome(): void {
    const gl = this.baseGl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.baseFramebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.chromeProgram);
    chromeMaterials.forEach((material, index) => {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, this.chromeMasks[material].texture);
      const uniformName = material === 'silver-chrome' ? 'u_silverMask' : material === 'copper-chrome' ? 'u_copperMask' : 'u_goldMask';
      gl.uniform1i(gl.getUniformLocation(this.chromeProgram, uniformName), index);
    });
    gl.bindVertexArray(this.baseVao);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  private scheduleRender(replay: boolean): void {
    this.renderReplayRequired ||= replay;
    if (this.renderRaf) return;
    this.renderRaf = requestAnimationFrame(() => {
      this.renderRaf = 0;
      const replayRequired = this.renderReplayRequired;
      this.renderReplayRequired = false;
      if (replayRequired) this.replayBase();
      else this.presentBase();
      this.startRunoffAnimation();
    });
  }

  private drawBaseDabs(dabs: Dab[], stroke: Stroke, maskOnly = false): void {
    if (!dabs.length) return;
    const gl = this.baseGl;
    const first = dabs[0];
    const vertices = new Float32Array(dabs.length * 3);
    dabs.forEach((dab, index) => vertices.set([dab.x, dab.y, dab.angle], index * 3));
    gl.bindVertexArray(this.baseVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.bindFramebuffer(gl.FRAMEBUFFER, maskOnly ? this.chromeMasks[stroke.material as ChromeMaterial].framebuffer : this.baseFramebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.baseProgram);
    gl.uniform2f(gl.getUniformLocation(this.baseProgram, 'u_targetSize'), this.canvas.width, this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(this.baseProgram, 'u_scale'), this.canvas.width / this.width, this.canvas.height / this.height);
    gl.uniform1f(gl.getUniformLocation(this.baseProgram, 'u_brushSize'), first.size);
    gl.uniform1i(gl.getUniformLocation(this.baseProgram, 'u_shape'), stroke.shape === 'round' ? 0 : stroke.shape === 'square' ? 1 : stroke.shape === 'chisel' ? 2 : 3);
    gl.uniform1i(gl.getUniformLocation(this.baseProgram, 'u_maskOnly'), maskOnly ? 1 : 0);
    gl.uniform3fv(gl.getUniformLocation(this.baseProgram, 'u_color'), this.parseColor(first.color));
    const attribute = gl.getAttribLocation(this.baseProgram, 'a_dab');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 12, 0);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, dabs.length);
    gl.disable(gl.BLEND);
  }

  private drawRunoffs(stroke: Stroke, maskOnly = false): void {
    const gl = this.baseGl;
    let drawingInitialized = false;
    let position = 0;
    let color = 0;
    this.runoffEngine.forEachGeometry(stroke, (component, geometry) => {
      if (!geometry.length) return;
      if (!drawingInitialized) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, maskOnly ? this.chromeMasks[stroke.material as ChromeMaterial].framebuffer : this.baseFramebuffer);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.runoffProgram);
        gl.uniform2f(gl.getUniformLocation(this.runoffProgram, 'u_resolution'), this.width, this.height);
        gl.uniform1i(gl.getUniformLocation(this.runoffProgram, 'u_maskOnly'), maskOnly ? 1 : 0);
        gl.bindVertexArray(this.runoffVao);
        position = gl.getAttribLocation(this.runoffProgram, 'a_position');
        color = gl.getAttribLocation(this.runoffProgram, 'a_color');
        gl.enableVertexAttribArray(position);
        gl.enableVertexAttribArray(color);
        if (maskOnly) {
          gl.enable(gl.BLEND);
          gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else gl.disable(gl.BLEND);
        drawingInitialized = true;
      }
      let cached = this.runoffGpuCache.get(component);
      if (!cached) {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('Could not allocate runoff geometry buffer.');
        cached = { buffer, geometry };
        this.runoffGpuCache.set(component, cached);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
      } else if (cached.geometry !== geometry) {
        cached.geometry = geometry;
        gl.bindBuffer(gl.ARRAY_BUFFER, cached.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.DYNAMIC_DRAW);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, cached.buffer);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 20, 8);
      gl.drawArrays(gl.TRIANGLES, 0, geometry.length / 5);
    });
    if (drawingInitialized && maskOnly) gl.disable(gl.BLEND);
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
  const scaleX = rect.width > 0 ? logicalWidth / rect.width : 0;
  const scaleY = rect.height > 0 ? logicalHeight / rect.height : 0;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}
