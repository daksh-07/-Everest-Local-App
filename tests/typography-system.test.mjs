import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fontFace,fontFaces,typography,isDisplayRole,nativeFontStyle} from '../lib/typography.ts';

test('real faces cover interface weights and legacy bold without synthetic variants',()=>{
  assert.equal(fontFace('400'),fontFaces.regular);
  assert.equal(fontFace('500'),fontFaces.medium);
  assert.equal(fontFace('600'),fontFaces.semibold);
  for(const weight of ['700','800','900','bold'])assert.equal(fontFace(weight),fontFaces.bold);
  assert.equal(fontFace('600',true),fontFaces.display);
  assert.equal(fontFace('700',true),fontFaces.displayBold);
  assert.equal(isDisplayRole('body'),false);
  assert.equal(isDisplayRole('price'),false);
  assert.equal(isDisplayRole('title'),true);
  assert.deepEqual(typography.price.fontVariant,['tabular-nums']);
});
test('every native PostScript alias and weight is embedded and has a web counterpart',()=>{
  const config=JSON.parse(fs.readFileSync('app.json','utf8'));
  const plugin=config.expo.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-font');
  for(const name of Object.values(fontFaces)){
    const file=`assets/fonts/${name}.ttf`;
    assert.ok(plugin[1].fonts.includes('./'+file));
    const bytes=fs.readFileSync(file);
    const count=bytes.readUInt16BE(4),tables=new Map();
    for(let i=0;i<count;i++){const at=12+i*16;tables.set(bytes.toString('ascii',at,at+4),bytes.readUInt32BE(at+8));}
    assert.equal(tables.has('fvar'),false,'Unsupported variable axes are not bundled');
    const weight=bytes.readUInt16BE(tables.get('OS/2')+4);
    assert.equal(weight,name.endsWith('SemiBold')?600:name.endsWith('Bold')?700:name.endsWith('Medium')?500:400);
    assert.equal(nativeFontStyle(name).fontWeight,String(weight),'iOS/Android requests the embedded face’s actual weight');
    const nameAt=tables.get('name'),strings=nameAt+bytes.readUInt16BE(nameAt+4);let postscript;
    for(let i=0;i<bytes.readUInt16BE(nameAt+2);i++){
      const at=nameAt+6+i*12;if(bytes.readUInt16BE(at+6)!==6)continue;
      const data=bytes.subarray(strings+bytes.readUInt16BE(at+10),strings+bytes.readUInt16BE(at+10)+bytes.readUInt16BE(at+8));
      postscript=bytes.readUInt16BE(at)===3?data.swap16().toString('utf16le'):data.toString('ascii');
    }
    assert.equal(postscript,name);
    assert.ok(fs.statSync(`public/fonts/${name}.woff2`).size>10000);
  }
});
