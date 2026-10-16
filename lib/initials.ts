/** "Priya Shah" → "PS", "north melbourne home" → "NM", empty → "E". Uses the first letter of up to two words. */
export function initialsOf(name:string|null|undefined){return (name??'Everest member').trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'E'}
