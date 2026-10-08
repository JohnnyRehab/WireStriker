(function (WS) {
'use strict';
/** 線分を画面空間で太らせたクアッドとして描くシェーダ */
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aPa;
layout(location=2) in vec3 aCa;
layout(location=3) in vec3 aPb;
layout(location=4) in vec3 aCb;
uniform mat4 uMVP;
uniform vec2 uRes;
uniform float uW;
uniform vec2 uFog;
uniform float uFogOn;
uniform vec4 uTint;
out vec3 vC;
out float vSide;
void main(){
  vec4 A=uMVP*vec4(aPa,1.0);
  vec4 B=uMVP*vec4(aPb,1.0);
  if(A.w<0.15||B.w<0.15){gl_Position=vec4(2.0,2.0,2.0,1.0);vC=vec3(0.0);vSide=0.0;return;}
  float t=aCorner.x;
  vec2 sa=A.xy/A.w*uRes*0.5;
  vec2 sb=B.xy/B.w*uRes*0.5;
  vec2 d=sb-sa;
  float len=length(d);
  d=len>0.0001?d/len:vec2(1.0,0.0);
  vec2 n=vec2(-d.y,d.x);
  vec4 P=mix(A,B,t);
  vec2 off=(n*aCorner.y+d*(t*2.0-1.0))*uW/uRes;
  gl_Position=vec4(P.xy+off*P.w,P.z,P.w);
  float w=mix(A.w,B.w,t);
  float f=uFogOn>0.5?clamp(1.0-(w-uFog.x)/(uFog.y-uFog.x),0.0,1.0):1.0;
  vC=mix(aCa,aCb,t)*f*uTint.rgb*uTint.a;
  vSide=aCorner.y;
}`;
const FS = `#version 300 es
precision mediump float;
in vec3 vC;
in float vSide;
out vec4 o;
void main(){
  float a=1.0-smoothstep(0.45,1.0,abs(vSide));
  o=vec4(vC*a,1.0);
}`;
Object.assign(WS, { VS, FS });
})(globalThis.WS || (globalThis.WS = {}));
