import {clamp} from './core.js';

const MAX_MEDIA_SECONDS=12*60*60;

function optionalNumber(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

export function normalizeClip(input={},existing={}){
  const previousStart=optionalNumber(existing.clipStart)??0;
  const requestedStart=optionalNumber(input.clipStart);
  const clipStart=clamp(requestedStart??previousStart,0,MAX_MEDIA_SECONDS,0);

  const previousEnd=optionalNumber(existing.clipEnd);
  const requestedEnd=Object.prototype.hasOwnProperty.call(input,'clipEnd')?optionalNumber(input.clipEnd):previousEnd;
  let clipEnd=requestedEnd===null?null:clamp(requestedEnd,0,MAX_MEDIA_SECONDS,null);
  if(clipEnd!==null&&clipEnd<=clipStart+.05)clipEnd=clipStart+.05;

  const segmentLength=clipEnd===null?null:Math.max(.05,clipEnd-clipStart);
  const fadeLimit=segmentLength===null?30:Math.max(0,segmentLength/2);
  const fadeIn=clamp(optionalNumber(input.fadeIn)??optionalNumber(existing.fadeIn)??0,0,fadeLimit,0);
  const fadeOut=clamp(optionalNumber(input.fadeOut)??optionalNumber(existing.fadeOut)??0,0,fadeLimit,0);

  return{clipStart,clipEnd,fadeIn,fadeOut};
}

export function clipWindow(item={},duration=0){
  const normalized=normalizeClip(item,item);
  const full=Math.max(0,Number(duration)||0);
  const start=Math.min(normalized.clipStart,full||normalized.clipStart);
  const end=normalized.clipEnd===null?(full||null):Math.min(normalized.clipEnd,full||normalized.clipEnd);
  return{...normalized,clipStart:start,clipEnd:end};
}
