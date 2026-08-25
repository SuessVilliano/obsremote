import {EventEmitter} from 'node:events';
import OBSWebSocket,{EventSubscription} from 'obs-websocket-js';

export class ObsTargetManager extends EventEmitter{
  constructor(target,{reconnectMaxMs=15000}={}){super();this.target=target;this.reconnectMaxMs=reconnectMaxMs;this.obs=null;this.state='idle';this.lastError='';this.reconnectAttempt=0;this.reconnectTimer=null;this.connectPromise=null;this.closed=false}
  status(){return{id:this.target.id,name:this.target.name,state:this.state,lastError:this.lastError,connected:this.state==='connected'}}
  async ensureConnected(){if(this.closed)throw new Error('OBS manager is closed');if(this.state==='connected'&&this.obs)return this.obs;if(this.connectPromise)return this.connectPromise;this.connectPromise=this.#connect();try{return await this.connectPromise}finally{this.connectPromise=null}}
  async #connect(){clearTimeout(this.reconnectTimer);this.reconnectTimer=null;this.#setState('connecting');const obs=new OBSWebSocket();this.obs=obs;this.#attach(obs);try{await obs.connect(this.target.url,this.target.password||'',{eventSubscriptions:EventSubscription.All});if(this.obs!==obs)throw new Error('OBS connection was superseded');this.reconnectAttempt=0;this.lastError='';this.#setState('connected');return obs}catch(error){this.lastError=error?.message||String(error);if(this.obs===obs){this.obs=null;this.#setState('error')}try{await obs.disconnect()}catch{}this.#scheduleReconnect();throw error}}
  #attach(obs){const relay=(name)=>(payload)=>{if(this.obs===obs)this.emit('obs-event',{name,payload})};for(const name of ['CurrentProgramSceneChanged','InputMuteStateChanged','InputVolumeChanged','SceneItemEnableStateChanged','StreamStateChanged','RecordStateChanged','SceneListChanged','InputCreated','InputRemoved','InputNameChanged'])obs.on(name,relay(name));obs.on('ConnectionClosed',()=>{if(this.obs!==obs)return;this.obs=null;this.lastError='OBS connection closed';this.#setState('offline');this.#scheduleReconnect()})}
  #setState(state){if(this.state===state)return;this.state=state;this.emit('status',this.status())}
  #scheduleReconnect(){if(this.closed||this.reconnectTimer)return;this.reconnectAttempt++;const delay=Math.min(this.reconnectMaxMs,750*Math.pow(1.7,Math.min(this.reconnectAttempt,8)));this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.ensureConnected().catch(()=>{})},delay)}
  async call(requestType,requestData){const obs=await this.ensureConnected();return obs.call(requestType,requestData)}
  async close(){this.closed=true;clearTimeout(this.reconnectTimer);this.reconnectTimer=null;const obs=this.obs;this.obs=null;if(obs)try{await obs.disconnect()}catch{}this.#setState('closed')}
}

export class ObsManagerPool extends EventEmitter{
  constructor(targets){super();this.managers=new Map(targets.map(t=>[String(t.id),new ObsTargetManager(t)]));for(const manager of this.managers.values()){manager.on('status',status=>this.emit('status',status));manager.on('obs-event',event=>this.emit('obs-event',{targetId:String(manager.target.id),...event}))}}
  has(id){return this.managers.has(String(id))}
  get(id){return this.managers.get(String(id))||this.managers.values().next().value}
  require(id){const manager=this.managers.get(String(id));if(!manager)throw new Error(`Unknown OBS target: ${id}`);return manager}
  statuses(){return[...this.managers.values()].map(m=>m.status())}
  async close(){await Promise.all([...this.managers.values()].map(m=>m.close()))}
}
