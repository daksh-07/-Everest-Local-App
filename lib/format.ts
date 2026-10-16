// Shared display formatting. Australian English is the default locale for the AU market;
// callers in other markets pass their own locale and currency.
const DEFAULT_LOCALE='en-AU';

function parseDay(value:string){
 // Date-only strings (YYYY-MM-DD) are local calendar days, not UTC instants.
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 return match?new Date(Number(match[1]),Number(match[2])-1,Number(match[3])):new Date(value);
}
function startOfDay(date:Date){return new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime()}

/** "Today", "Tomorrow", "Yesterday" or "Tue 20 Oct" (year added when not the current year). */
export function formatDay(value:string|null|undefined,{now=new Date(),locale=DEFAULT_LOCALE}:{now?:Date;locale?:string}={}){
 if(!value)return '';
 const date=parseDay(value);if(Number.isNaN(date.getTime()))return '';
 const diff=Math.round((startOfDay(date)-startOfDay(now))/86_400_000);
 if(diff===0)return 'Today';if(diff===1)return 'Tomorrow';if(diff===-1)return 'Yesterday';
 return date.toLocaleDateString(locale,{weekday:'short',day:'numeric',month:'short',...(date.getFullYear()!==now.getFullYear()?{year:'numeric'}:{})});
}

/** "10:00 am" from "10:00" or "10:00:00". Returns '' for missing or malformed values. */
export function formatTime(value:string|null|undefined,{locale=DEFAULT_LOCALE}:{locale?:string}={}){
 const match=value?/^(\d{1,2}):(\d{2})/.exec(value):null;if(!match)return '';
 const date=new Date(2000,0,1,Number(match[1]),Number(match[2]));
 return date.toLocaleTimeString(locale,{hour:'numeric',minute:'2-digit'}).replace(/\s?([AP]M)$/i,(_m,p:string)=>' '+p.toLowerCase());
}

export function formatSchedule(day:string|null|undefined,time?:string|null,options?:{now?:Date;locale?:string}){
 return [formatDay(day,options),formatTime(time,options)].filter(Boolean).join(' · ');
}

export function formatMoney(value:number|string|null|undefined,{currency='AUD',locale=DEFAULT_LOCALE}:{currency?:string;locale?:string}={}){
 const amount=Number(value);if(value===null||value===undefined||!Number.isFinite(amount))return '';
 return new Intl.NumberFormat(locale,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(amount);
}

const ACRONYMS=new Set(['VIP','CRM','ABN','GST','ETA','DM','AI','SMS','ID']);
/** Server enums such as PENDING_PAYMENT become sentence case: "Pending payment". Acronyms stay upper case. */
export function formatStatus(value:string|null|undefined,fallback='Pending'){
 const words=(value??'').replaceAll('_',' ').trim().split(/\s+/).filter(Boolean);
 if(!words.length)return fallback;
 return words.map((word,index)=>{const upper=word.toUpperCase();if(ACRONYMS.has(upper))return upper;const lower=word.toLowerCase();return index===0?lower[0].toUpperCase()+lower.slice(1):lower}).join(' ');
}

/** List timestamp: "2:30 pm" today, otherwise "Yesterday" or "Tue 14 Oct". */
export function formatWhen(value:string|null|undefined,{now=new Date(),locale=DEFAULT_LOCALE}:{now?:Date;locale?:string}={}){
 if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 if(startOfDay(date)===startOfDay(now))return formatTime(`${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`,{locale});
 const local=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 return formatDay(local,{now,locale});
}
