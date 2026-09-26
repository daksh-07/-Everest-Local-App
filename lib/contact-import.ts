import type {CrmImportRow} from './crm';

const aliases:Record<string,keyof CrmImportRow>={
 name:'name','full name':'name','contact name':'name',phone:'phone','phone number':'phone','mobile':'phone','mobile phone':'phone',
 email:'email','email address':'email',company:'company','company name':'company',suburb:'suburb',city:'city',state:'state',country:'country',notes:'notes',note:'notes',
};
function cells(line:string){const result:string[]=[];let current='';let quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}else if(char===','&&!quoted){result.push(current.trim());current='';}else current+=char;}result.push(current.trim());return result;}
export function parseContactCsv(input:string){
 const lines=input.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());if(lines.length<2)return[];
 const headers=cells(lines[0]).map(value=>aliases[value.trim().toLowerCase()]??null);
 const rows:CrmImportRow[]=[];
 for(const line of lines.slice(1,1001)){const values=cells(line);const row:Partial<CrmImportRow>={};headers.forEach((key,index)=>{if(key&&values[index]?.trim())row[key]=values[index].trim();});if(row.name)rows.push(row as CrmImportRow);}
 return rows;
}
