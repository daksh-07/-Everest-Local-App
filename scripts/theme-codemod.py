#!/usr/bin/env python3
"""One-off migration: convert a screen's static StyleSheet with literal colours to theme tokens.

Mapping is by (property, literal): dark fills become the primary action colour and their white
text becomes onBrand; white surfaces become `surface`; beige canvases become `canvas`; greys become
text roles; reds/greens become danger/success (and their light tints the matching containers).
Usage: python3 scripts/theme-codemod.py app/screen.tsx ...  (review the diff; typecheck)."""
import re,sys
BG={'#fff':'surface','#ffffff':'surface','#111':'brand','#151515':'brand','#000':'brand','#f8f7f4':'canvas','#faf9f6':'canvas','#f7f6f2':'canvas',
    '#eeece7':'soft','#f3eee4':'accentSoft','#f3f1ed':'soft','#f0eee9':'soft','#e5e2dc':'soft','#fff4df':'warningContainer','#fff3f2':'dangerContainer','#fff1f0':'dangerContainer',
    '#f7fbf8':'successContainer','#e8f3ec':'successContainer','#e7f3eb':'successContainer'}
FG={'#fff':'onBrand','#111':'text','#151515':'text','#222':'text','#333':'text','#444':'textSecondary','#555':'textSecondary','#666':'textSecondary','#6d665c':'textSecondary','#777':'textSecondary',
    '#999':'muted','#aaa':'muted','#b42318':'danger','#a12820':'danger','#245b35':'success','#2c6842':'success','#765f2d':'accent','#7c632c':'accent'}
BORDER={'#111':'brand','#b42318':'danger','#245b35':'success','#aabdaf':'success'}
def role(prop,hexv):
    h=hexv.lower();p=prop.lower()
    if p=='backgroundcolor':return BG.get(h)
    if p in('bordercolor','borderbottomcolor','bordertopcolor','borderleftcolor','borderrightcolor'):return BORDER.get(h,'border')
    if p in('color','tintcolor','shadowcolor'):return None if p=='shadowcolor' else FG.get(h)
    return None
def convert(src):
    misses=[]
    def rep(m):
        prop,hexv=m.group(1),m.group(2);r=role(prop,hexv)
        if not r:misses.append(f'{prop}:{hexv}');return m.group(0)
        return f'{prop}:c.{r}'
    i=src.find('StyleSheet.create(');
    if i<0:return src,['no StyleSheet']
    head,styles=src[:i],src[i:]
    styles=re.sub(r"([a-zA-Z]+Color|color):\s*'(#[0-9a-fA-F]{3,6})'",rep,styles)
    head=re.sub(r"placeholderTextColor=\"#[0-9a-fA-F]+\"","placeholderTextColor={themeColors.muted}",head)
    head=re.sub(r"(\s)color=\"#fff\"",r"\1color={themeColors.onBrand}",head)
    head=re.sub(r"color=\{?'#(?:111|151515)'\}?","color={themeColors.text}",head)
    src=head+styles
    # const s = StyleSheet.create({ ... })  ->  const createStyles=(c:ThemeColors)=>StyleSheet.create({ ... })
    src=re.sub(r"const\s+(\w+)\s*=\s*StyleSheet\.create\(",lambda m:f"const create_{m.group(1)}=(c:ThemeColors)=>StyleSheet.create(",src,count=1)
    name=re.search(r"const create_(\w+)=",src).group(1)
    # inject the hook into every top-level function whose body uses the style object or themeColors
    out=[];pos=0
    for fm in re.finditer(r"^(?:export default )?function \w+\s*\(",src,flags=re.M):
        j=fm.end()-1;depth=0
        while True:
            ch=src[j]
            if ch=='(':depth+=1
            elif ch==')':
                depth-=1
                if depth==0:break
            j+=1
        k=src.index('{',j)
        # body end: naive next top-level 'function ' or the styles factory
        nxt=re.search(r"^(?:export default )?function \w+\s*\(|^const create_",src[k:],flags=re.M)
        body=src[k:k+(nxt.start() if nxt else len(src)-k)]
        inject=''
        if re.search(rf"\b{name}\.",body):inject+=f"const {name}=useThemedStyles(create_{name});"
        if 'themeColors.' in body:inject+="const {colors:themeColors}=useAppTheme();"
        if inject:out.append((k+1,inject))
    for p,txt in reversed(out):src=src[:p]+txt+src[p:]
    imp="import {useAppTheme,useThemedStyles,type ThemeColors} from '@/lib/theme';\n"
    src=re.sub(r"^(import [^\n]*\n)",lambda m:m.group(1)+imp,src,count=1,flags=re.M) if not src.startswith('import') else imp+src
    return src,misses
for path in sys.argv[1:]:
    s=open(path).read();n,miss=convert(s);open(path,'w').write(n)
    print(path,'unmapped:',sorted(set(miss)) if miss else 'none')
