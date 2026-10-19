import type {PostComment} from './social';
export type CommentOrder='NEWEST'|'OLDEST';
export type CommentThread={id:string;root:PostComment|null;replies:PostComment[]};
export const COMMENT_LIMIT=2000;
export const commentLength=(text:string)=>Array.from(text.trim()).length;
export const fitComment=(text:string)=>Array.from(text).slice(0,COMMENT_LIMIT).join('');
export function mergeComments(current:PostComment[],incoming:PostComment[]){
 const rows=new Map(current.map(row=>[row.id,row]));
 for(const row of incoming)rows.set(row.id,{...rows.get(row.id),...row});
 return [...rows.values()];
}
export function commentThreads(rows:PostComment[],order:CommentOrder):CommentThread[]{
 const visible=rows.filter(row=>row.status==='VISIBLE');const byId=new Map(visible.map(row=>[row.id,row]));
 const groups=new Map<string,CommentThread>();
 for(const row of visible){
  let parent=row;const seen=new Set<string>();let missing:string|null=null;
  while(parent.parent_id){
   if(seen.has(parent.id)){missing=`cycle:${[...seen].sort()[0]}`;break;}seen.add(parent.id);
   const next=byId.get(parent.parent_id);if(!next){missing=`missing:${parent.parent_id}`;break;}parent=next;
  }
  const id=missing??parent.id;
  const thread=groups.get(id)??{id,root:missing?null:parent,replies:[]};
  if(missing||row.id!==parent.id)thread.replies.push(row);groups.set(id,thread);
 }
 const chronological=(a:PostComment,b:PostComment)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);
 return [...groups.values()].map(group=>({...group,replies:group.replies.sort(chronological)})).sort((a,b)=>{
  const firstA=a.root??a.replies[0],firstB=b.root??b.replies[0];const compared=chronological(firstA,firstB);return order==='NEWEST'?-compared:compared;
 });
}
export function commentCursorFilter(cursor:Pick<PostComment,'id'|'created_at'>,order:CommentOrder){
 if(!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(cursor.id)||!/^\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d)$/.test(cursor.created_at)||!Number.isFinite(Date.parse(cursor.created_at)))throw new Error('Comment position is invalid. Refresh the conversation.');
 const operator=order==='NEWEST'?'lt':'gt';
 return `created_at.${operator}."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.${operator}.${cursor.id})`;
}
export function commentId(){
 const cryptoApi=(globalThis as typeof globalThis&{crypto?:{randomUUID?:()=>string}}).crypto;
 return cryptoApi?.randomUUID?.()??'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,char=>{const n=Math.floor(Math.random()*16);return (char==='x'?n:(n&3)|8).toString(16)});
}
export type CommentAttempt={id:string;body:string;parent:string|null};
const drafts=new Map<string,{text:string;reply:PostComment|null;attempt:CommentAttempt|null;at:number}>();
export function getCommentDraft(key:string){const value=drafts.get(key);if(value&&Date.now()-value.at<3600000)return value;drafts.delete(key);return {text:'',reply:null,attempt:null};}
export function saveCommentDraft(key:string,text:string,reply:PostComment|null){
 const attempt=drafts.get(key)?.attempt??null;drafts.delete(key);if(text.trim())drafts.set(key,{text:fitComment(text),reply,attempt,at:Date.now()});
 while(drafts.size>20)drafts.delete(drafts.keys().next().value as string);
}

export function saveCommentAttempt(key:string,attempt:CommentAttempt){const draft=drafts.get(key);if(draft)drafts.set(key,{...draft,attempt});}
