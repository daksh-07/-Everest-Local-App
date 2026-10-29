/** Display-only projection. Quote/booking eligibility stays authoritative on the server. */
export type BusinessOpportunity={id:string;request_id:string;status:string;description:string;created_at?:string;expires_at:string|null};
export function activeBusinessOpportunities(rows:BusinessOpportunity[],now=Date.now()){
 return rows.filter(row=>row.status==='OPEN'&&Boolean(row.id&&row.request_id)&&(row.expires_at===null||(Number.isFinite(Date.parse(row.expires_at))&&Date.parse(row.expires_at)>now)))
 .sort((a,b)=>(a.expires_at===null?Infinity:Date.parse(a.expires_at))-(b.expires_at===null?Infinity:Date.parse(b.expires_at))||String(a.created_at??'').localeCompare(String(b.created_at??''))||a.id.localeCompare(b.id));
}
