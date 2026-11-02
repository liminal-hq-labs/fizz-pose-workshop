# Builds the Classic Fizz pose workshop and its standalone preview.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

from pathlib import Path
from PIL import Image, ImageDraw
import json, math, shutil

ROOT = Path(__file__).resolve().parent
ORIGINAL = json.loads((ROOT / 'source' / 'classic-fizz-original.json').read_text())
PALETTE = {**ORIGINAL['palette'], 'b': '#5555ff', 'A': '#334488', 'N': '#aa5500'}
# The standing frame is the unmodified native study; action frames inherit its head and torso.
BASE = ORIGINAL['grid']

FRAMES = {}

class Art:
    def __init__(self, w=24, h=44):
        self.w, self.h = w, h
        self.g = [['.'] * w for _ in range(h)]
    def rect(self,x,y,w,h,c):
        for yy in range(max(0,y),min(self.h,y+h)):
            for xx in range(max(0,x),min(self.w,x+w)): self.g[yy][xx]=c
    def stamp(self,rows,x,y):
        for yy,row in enumerate(rows):
            for xx,c in enumerate(row):
                if c!='.': self.rect(x+xx,y+yy,1,1,c)
    def limb(self,points,width,c):
        # Draw connected pixel clusters, with a one-pixel dark silhouette.
        for colour, thickness in [('K',width+2),(c,width)]:
            im=Image.new('1',(self.w,self.h)); d=ImageDraw.Draw(im)
            d.line(points,fill=1,width=thickness)
            for x,y in points: d.rectangle((x-thickness//2,y-thickness//2,x+(thickness-1)//2,y+(thickness-1)//2),fill=1)
            for y in range(self.h):
                for x in range(self.w):
                    if im.getpixel((x,y)): self.g[y][x]=colour
    def shoe(self,x,y):
        self.rect(x-1,y-1,6,5,'K');self.rect(x,y,4,2,'R');self.rect(x+3,y+1,2,1,'W');self.rect(x,y+2,5,1,'W');self.rect(x,y+3,5,1,'D')
    def glove(self,x,y):
        self.rect(x-1,y-1,4,4,'K');self.rect(x,y,2,2,'W');self.rect(x,y+1,2,1,'L')
    def save(self,name):
        FRAMES[name]={'width':self.w,'height':self.h,'grid':[''.join(r) for r in self.g]}


def side(pose):
    a=Art();x,y=4,4
    bob=1 if pose in ['run2','pogo2'] else 0
    y+=bob
    if pose=='stand' or pose in ['lookUp','lookDown']:
        a.stamp(BASE,x,y)
    else:
        a.stamp(BASE[:20],x,y)
        # Remove the resting near arm before drawing the action.
        a.rect(x+9,y+15,5,5,'.')
        a.rect(x+9,y+15,1,4,'K')
        # Each leg has its own knee and ankle; soles share a stable standing baseline.
        legs={
          'run1': [([(9,25),(7,30),(5,33)],3), ([(14,25),(16,29),(19,30)],2)],
          'run2': [([(9,25),(11,29),(13,34)],3), ([(14,25),(12,29),(9,32)],2)],
          'run3': [([(9,25),(12,29),(17,33)],3), ([(14,25),(10,29),(6,30)],2)],
          'run4': [([(9,25),(10,29),(8,34)],3), ([(14,25),(15,28),(17,31)],2)],
          'jump': [([(9,25),(7,28),(6,29)],3), ([(14,25),(17,26),(18,25)],2)],
          'mantle1': [([(9,25),(9,30),(8,34)],3), ([(14,25),(15,29),(18,31)],2)],
          'mantle2': [([(9,25),(8,30),(6,33)],3), ([(14,25),(18,26),(18,29)],2)],
          'mantle3': [([(9,25),(8,29),(6,32)],3), ([(14,25),(18,24),(20,26)],2)],
          'pogo': [([(9,25),(8,28),(9,30)],3), ([(14,25),(16,28),(15,30)],2)],
          'pogo2': [([(9,26),(7,29),(9,31)],3), ([(14,26),(17,29),(15,31)],2)]
        }
        for points,width in legs.get(pose,[([(9,25),(9,29),(8,34)],3), ([(14,25),(14,29),(15,34)],2)]):
            a.limb(points,width,'B');a.rect(points[0][0],points[0][1],1,3,'s');a.rect(points[0][0]+1,points[0][1]+1,1,3,'c');a.shoe(points[-1][0]-1,points[-1][1])
        if pose in ['pogo','pogo2']:
            # The spring compresses while the tip remains at a fixed contact point.
            a.rect(11,21,2,19,'L');a.rect(9,22,7,1,'D');a.rect(8,33,9,1,'D')
            for yy in ([35,37,39] if pose=='pogo' else [37,38,39]): a.rect(10,yy,4,1,'D')
            a.rect(11,41,3,1,'K');a.limb([(14,17),(16,21),(13,22)],2,'r');a.glove(12,22)
        elif pose.startswith('mantle'):
            arms={'mantle1':[([(9,17),(8,12),(16,7)],2), ([(15,17),(19,12),(21,8)],2)],
                  'mantle2':[([(9,17),(15,13),(20,13)],2), ([(15,17),(18,15),(21,15)],2)],
                  'mantle3':[([(9,17),(7,19),(6,22)],2), ([(15,17),(18,21),(20,23)],2)]}
            for points,width in arms[pose]:a.limb(points,width,'r');a.glove(*points[-1])
        elif pose in ['shoot','shootRecoil','aimUp','aimDown']:
            points={'shoot':[(15,17),(18,18),(20,18)],'shootRecoil':[(15,17),(17,17),(19,17)],'aimUp':[(15,17),(18,12),(18,8)],'aimDown':[(15,17),(18,21),(18,25)]}[pose]
            a.limb(points,2,'r');a.glove(*points[-1]);gx,gy=points[-1]
            if pose=='aimUp':
                a.rect(gx-1,gy-4,3,5,'K');a.rect(gx,gy-3,2,3,'c');a.rect(gx,gy-4,2,1,'W')
            elif pose=='aimDown':
                a.rect(gx-1,gy,4,5,'K');a.rect(gx,gy,2,4,'c');a.rect(gx,gy+4,2,1,'W')
            else:
                a.rect(gx-1,gy-2,5,4,'K');a.rect(gx,gy-1,3,2,'c');a.rect(gx+3,gy-1,1,2,'W');a.rect(gx,gy-2,2,1,'g')
        else:
            swing=-2 if pose in ['run1','run4'] else 1
            a.limb([(15,17),(17,20+swing),(15,23+swing)],2,'r');a.glove(15,23+swing)
    if pose in ['lookUp','aimUp']:
        a.rect(6,9,9,3,'h');a.rect(9,9,1,1,'K');a.rect(12,9,1,1,'K');a.rect(11,12,2,1,'V')
    if pose in ['lookDown','aimDown']:
        a.rect(6,9,9,3,'h');a.rect(9,11,1,1,'K');a.rect(12,11,1,1,'K');a.rect(6,8,10,2,'G')
    a.save('ben_'+pose)


def climb(f):
    a=Art();a.stamp(BASE[:5],4,4)
    a.rect(7,9,9,4,'K');a.rect(8,9,7,3,'N');a.rect(10,10,2,3,'Q');a.rect(7,9,9,1,'L')
    a.rect(7,14,10,10,'K');a.rect(8,14,8,9,'r');a.rect(11,15,2,7,'R');a.rect(8,23,8,2,'D')
    for xx,raised in [(7,f==0),(17,f==1)]:
        pts=[(xx,16),(xx-1 if xx==7 else xx+1,12 if raised else 19),(xx,8 if raised else 21)]
        a.limb(pts,2,'r');a.glove(*pts[-1])
    for xx,raised in [(9,f==1),(14,f==0)]:
        pts=[(xx,25),(xx+(-1 if raised else 0),29),(xx,31 if raised else 34)]
        a.limb(pts,3,'B');a.rect(xx,25,1,3,'s');a.rect(xx+1,26,1,2,'c');a.shoe(xx-1,pts[-1][1])
    a.save('ben_climb'+str(f+1))


def overworld(direction,f):
    # Helmet seen from above: a large crown, curved rear edge, directional brim and a short visible face.
    a=Art(24,24)
    vx,vy={'N':(0,-1),'NE':(1,-1),'E':(1,0),'SE':(1,1),'S':(0,1),'SW':(-1,1),'W':(-1,0),'NW':(-1,-1)}[direction]
    heading=math.atan2(vy,vx)
    # Below the crown are a foreshortened shirt, swinging hands and alternating shoes.
    a.rect(7,11,10,8,'K');a.rect(8,12,8,6,'r');a.rect(9,17,6,2,'R')
    for xx,phase in [(8,f),(14,1-f)]:
        a.rect(xx,18,3,3,'B');a.shoe(xx-1,20-phase)
    a.rect(5,13+f,2,4,'R');a.glove(5,16+f)
    a.rect(17,14-f,2,4,'r');a.glove(17,17-f)
    # Face is visible only on the forward edge of the helmet; never a full side-view head.
    fx,fy=round(12+vx*4),round(9+vy*4)
    a.rect(fx-2,fy-1,5,3,'h')
    if vy>=0:
        a.rect(fx-1,fy,1,1,'K');a.rect(fx+1,fy,1,1,'K')
    for y in range(3,15):
        for x in range(5,19):
            radius=((x-11.5)/6.5)**2+((y-8)/5.5)**2
            if radius<=1:
                c='K' if radius>.77 else ('L' if y>10 else 'G' if y>8 else 'g')
                # Stripe rotates with the facing direction; vents flank it.
                across=(x-11.5)*(-math.sin(heading))+(y-8)*math.cos(heading)
                along=(x-11.5)*math.cos(heading)+(y-8)*math.sin(heading)
                if radius<.65 and abs(across)<.8:c='W' if across<0 else 'Q'
                elif radius<.65 and 2<abs(across)<3.2 and abs(along)<2:c='Q'
                a.rect(x,y,1,1,c)
    # Distinct directional brim makes north/east/diagonal headings easy to tell apart.
    bx,by=round(12+vx*6),round(8+vy*5)
    a.rect(bx-(2 if vx==0 else 1),by-1,5 if vx==0 else 3,2 if vx==0 else 3,'K')
    a.rect(bx-(1 if vx==0 else 0),by,3 if vx==0 else 2,1 if vx==0 else 2,'G')
    a.save(f'benMap_{direction}{f}')

for pose in ['stand','run1','run2','run3','run4','jump','shoot','shootRecoil','pogo','pogo2','mantle1','mantle2','mantle3','lookUp','lookDown','aimUp','aimDown']: side(pose)
for f in range(2): climb(f)
for direction in ['N','NE','E','SE','S','SW','W','NW']:
    for f in range(2): overworld(direction,f)

ANIMATIONS={
'walk-run':(['ben_run1','ben_run2','ben_run3','ben_run4'],[140]*4),
'pogo':(['ben_pogo','ben_pogo2'],[180,140]),
'climb':(['ben_climb1','ben_climb2'],[220,220]),
'mantle':(['ben_mantle1','ben_mantle2','ben_mantle3','ben_stand'],[240,240,240,600]),
'fizz-blaster':(['ben_shoot','ben_shootRecoil','ben_shoot'],[300,100,200])}
for d in ['N','NE','E','SE','S','SW','W','NW']: ANIMATIONS['overworld-'+d]=([f'benMap_{d}0',f'benMap_{d}1'],[180,180])

for folder in ['frames','animations','sheets']: (ROOT/folder).mkdir(exist_ok=True)
def raster(frame):
    im=Image.new('RGBA',(frame['width'],frame['height']))
    for y,row in enumerate(frame['grid']):
        for x,c in enumerate(row):
            if PALETTE[c]:im.putpixel((x,y),tuple(bytes.fromhex(PALETTE[c][1:]))+(255,))
    return im

def rects(frame):
    return '\n'.join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{PALETTE[c]}"/>' for y,row in enumerate(frame['grid']) for x,c in enumerate(row) if PALETTE[c])

for name,frame in FRAMES.items():
    raster(frame).save(ROOT/'frames'/f'{name}.png')
    (ROOT/'frames'/f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{frame["width"]}" height="{frame["height"]}" viewBox="0 0 {frame["width"]} {frame["height"]}" shape-rendering="crispEdges"><title>{name}</title>{rects(frame)}</svg>\n')

for name,(names,times) in ANIMATIONS.items():
    frames=[FRAMES[n] for n in names];w,h=frames[0]['width'],frames[0]['height'];total=sum(times)
    css=''.join(f'.f{i}{{animation:a{i} {total}ms steps(1,end) infinite}}@keyframes a{i}{{0%{{visibility:{"visible" if i==0 else "hidden"}}}{sum(times[:i])/total*100:.4f}%{{visibility:visible}}{sum(times[:i+1])/total*100:.4f}%{{visibility:hidden}}100%{{visibility:hidden}}}}' for i in range(len(frames)))
    css+='@media(prefers-reduced-motion:reduce){g{animation:none!important;visibility:hidden}g:first-of-type{visibility:visible}}'
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges"><style>{css}</style>'+''.join(f'<g class="f{i}" visibility="hidden">{rects(f)}</g>' for i,f in enumerate(frames))+'</svg>'
    (ROOT/'animations'/f'{name}.svg').write_text(svg)
    # Use one explicit indexed palette for all GIF frames, reserving index zero for transparency.
    colours=list(dict.fromkeys(c for c in PALETTE.values() if c))
    pal=[0,0,0]+[v for c in colours for v in bytes.fromhex(c[1:])];pal+= [0]*(768-len(pal))
    indexed=[]
    for frame in frames:
        im=Image.new('P',(w,h),0);im.putpalette(pal)
        im.putdata([0 if c=='.' else colours.index(PALETTE[c])+1 for row in frame['grid'] for c in row]);indexed.append(im)
    indexed[0].save(ROOT/'animations'/f'{name}.gif',save_all=True,append_images=indexed[1:],duration=times,loop=0,transparency=0,disposal=2,optimize=False)

sheet=Image.new('RGBA',(24*8,44*math.ceil(len(FRAMES)/8)))
positions={}
for i,(name,frame) in enumerate(FRAMES.items()):
    x,y=(i%8)*24,(i//8)*44;sheet.paste(raster(frame),(x,y));positions[name]={'x':x,'y':y,'width':frame['width'],'height':frame['height']}
sheet.save(ROOT/'sheets'/'ben-poses.png')
(ROOT/'assets.json').write_text(json.dumps({'palette':PALETTE,'frames':FRAMES,'animations':{n:{'frames':fs,'durationsMs':ts} for n,(fs,ts) in ANIMATIONS.items()},'sheet':positions},indent=2)+'\n')
# Render the comparison directly from the vendored native grid.
raster({'width':16,'height':32,'grid':BASE}).resize((96,192),Image.Resampling.NEAREST).save(ROOT/'original-study.png')

html='''<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Classic Fizz · Ben Pose Workshop</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101719;color:#e8f1e5}*{box-sizing:border-box}body{max-width:1400px;margin:auto;padding:32px}h1{font-size:clamp(2rem,5vw,3.6rem);margin:.3em 0}h2{margin-top:48px}p{max-width:840px;line-height:1.6;color:#b4c7bc}.eyebrow{color:#a9ee73;letter-spacing:.16em;font-size:.8rem}nav,.controls{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0;align-items:center}a{color:#b8ef92}button,select,input{font:inherit}button,select{background:#23372d;color:#e8f1e5;border:1px solid #607c62;border-radius:6px;padding:8px 12px}label{display:flex;gap:8px;align-items:center}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}article{border:1px solid #344a3f;border-radius:12px;overflow:hidden;background:#17231e}article h3,article p{margin:16px}article p{font-size:.85rem}.stage{height:300px;display:flex;align-items:center;justify-content:center;background-color:#20302c;background-image:linear-gradient(45deg,#ffffff05 25%,transparent 25%,transparent 75%,#ffffff05 75%),linear-gradient(45deg,#ffffff05 25%,transparent 25%,transparent 75%,#ffffff05 75%);background-size:16px 16px;background-position:0 0,8px 8px}.stage img,.stage canvas{image-rendering:pixelated;max-width:100%;object-fit:contain}.stage canvas{transform:scaleX(var(--facing,1))}.compass{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.compass article .stage{height:190px}.compass h3{font-size:1rem}.original{display:flex;gap:32px;flex-wrap:wrap}.original article{min-width:240px}.small{font-size:.85rem}footer{margin-top:40px;color:#9bb3a4}@media(max-width:600px){body{padding:16px}.compass{gap:6px}.compass article h3{margin:8px}.compass article .stage{height:128px}.compass article p{display:none}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><div class="eyebrow">LIEUTENANT FIZZ / ART WORKSHOP</div><h1>Classic Fizz, in motion.</h1><p>The original native three-quarter Ben expanded into a complete pose study: the original flat-topped green helmet, broken white-and-green stripe, grey helmet rim, warm face, gold Fizz emblem, cyan denim seams and red high-tops. Side-view actions share a padded 24 × 44 canvas. The overworld uses a separate top-down 24 × 24 design.</p><nav><a href="#comparison">Original & derived stance</a><a href="#motion">Action loops</a><a href="#overworld">Eight-direction overworld</a><a href="#poses">All frames</a><a href="assets.json">Editable grids & timing</a></nav><div class="controls"><button id="play">Pause animations</button><label>Preview scale <select id="scale"><option value="4">4×</option><option value="6" selected>6×</option></select></label><label><input id="flip" type="checkbox">Face left (side-view)</label><label>Speed <select id="speed"><option value="0.5">Half speed</option><option value="1" selected>Normal</option><option value="2">Double speed</option></select></label></div><p class="small">Animations show pose sequences for art review. Timing is a workshop choice; the game simulation controls actual action timing. Download individual transparent PNG/SVG frames, animated SVG/GIF loops or the sprite sheet from this folder.</p><h2 id="comparison">Original & derived stanceed stance</h2><div class="original"><article><div class="stage"><img src="original-study.png" alt="Original native Classic Fizz study" width="96" height="192"></div><h3>Original · 16 × 32</h3></article><article><div class="stage"><canvas data-frame="ben_stand" aria-label="Original Classic Fizz on the shared pose canvas" role="img"></canvas></div><h3>Original base · padded 24 × 44</h3></article></div><h2 id="motion">Action loops</h2><div class="grid" id="motions"></div><h2 id="overworld">Top-down overworld · eight directions</h2><p>A helmet crown seen from above, a directional brim, foreshortened body and alternating footsteps. Each direction has two walk frames. North faces away; south reveals the face below the brim.</p><div class="compass" id="compass"></div><h2 id="poses">Every game pose, reinterpreted</h2><p>Includes all sixteen side-view pose names from the game, two additional run phases and a recoil frame. The current two overworld frames are replaced here by sixteen directional frames.</p><div class="grid" id="frames"></div><footer>Standalone art study. The original files and game assets are preserved. <a href="README.md">Asset notes</a> · <a href="sheets/ben-poses.png">PNG sprite sheet</a></footer><script>
'''
html+='const DATA = '+json.dumps({'palette':PALETTE,'frames':FRAMES,'animations':{n:{'frames':fs,'durationsMs':ts} for n,(fs,ts) in ANIMATIONS.items()}})+';\n'
html+='''const motionNames={'walk-run':'Walk / run','pogo':'Pogo · extend / compress','climb':'Ladder climb','mantle':'Ledge pull-up · grip / haul / push','fizz-blaster':'Fizz Blaster · recoil'};
function card(title,key,animated,extra=''){return `<article><div class="stage"><canvas role="img" aria-label="${title}" data-${animated?'animation':'frame'}="${key}" ${extra}></canvas></div><h3>${title}</h3><p>${animated?`<a href="animations/${key}.svg">Animated SVG</a> · <a href="animations/${key}.gif">GIF</a>`:`<a href="frames/${key}.png">PNG</a> · <a href="frames/${key}.svg">SVG</a>`}</p></article>`;}
document.querySelector('#motions').innerHTML=Object.entries(motionNames).map(([k,v])=>card(v,k,true)).join('');
const directionNames={NW:'North-west',N:'North',NE:'North-east',W:'West',E:'East',SW:'South-west',S:'South',SE:'South-east'};
document.querySelector('#compass').innerHTML=['NW','N','NE','W',null,'E','SW','S','SE'].map(d=>d?card(directionNames[d],'overworld-'+d,true,'data-topdown="true"'):'<div aria-hidden="true" style="display:grid;place-items:center;color:#a9ee73">N ↑</div>').join('');
document.querySelector('#frames').innerHTML=Object.keys(DATA.frames).map(k=>card(k.replace('ben_','').replaceAll('_',' '),k,false,k.startsWith('benMap')?'data-topdown="true"':'')).join('');
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=performance.now(),scale=6,speed=1;
const btn=document.querySelector('#play');function updateButton(){btn.textContent=playing?'Pause animations':'Play animations';btn.setAttribute('aria-pressed',String(playing));}updateButton();btn.onclick=()=>{playing=!playing;updateButton();};
document.querySelector('#scale').onchange=e=>{scale=Number(e.target.value);};document.querySelector('#speed').onchange=e=>{speed=Number(e.target.value);};document.querySelector('#flip').onchange=e=>{document.documentElement.style.setProperty('--facing',e.target.checked?-1:1);};
const canvases=[...document.querySelectorAll('canvas')];
function tick(now){if(playing)elapsed+=(now-last)*speed;last=now;for(const c of canvases){let key=c.dataset.frame;if(c.dataset.animation){const a=DATA.animations[c.dataset.animation];let t=elapsed%a.durationsMs.reduce((s,v)=>s+v,0),i=0;while(i<a.frames.length-1&&t>=a.durationsMs[i]){t-=a.durationsMs[i];i++;}key=a.frames[i];}const f=DATA.frames[key];if(c.width!==f.width||c.height!==f.height){c.width=f.width;c.height=f.height;}const top=c.dataset.topdown;const actualScale=top&&innerWidth<600?3:scale;c.style.width=f.width*actualScale+'px';c.style.height=f.height*actualScale+'px';if(top)c.style.transform='none';const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const colour=DATA.palette[f.grid[y][x]];if(colour){ctx.fillStyle=colour;ctx.fillRect(x,y,1,1);}}}requestAnimationFrame(tick);}requestAnimationFrame(tick);
</script></body></html>'''
(ROOT/'preview.html').write_text(html)
(ROOT/'README.md').write_text('''# Original Classic Fizz pose workshop

A pose set derived from the unmodified original native Classic Fizz study, vendored in `source/classic-fizz-original.json`. The initial polished version is preserved in the first Git commit. The original files are preserved. Open `preview.html` directly in a browser; no server or dependencies are needed for viewing. The preview supports pause, scale, playback speed and side-view mirroring, and initially pauses when reduced motion is requested.

## Artwork

The three-quarter side-view keeps the exact original 16 × 32 standing grid on a transparent 24 × 44 canvas with room for raised arms, a blaster and a pogo spring. The standing grid is pixel-identical to the original, translated by (4, 4) into the shared canvas. Action frames use its original head and torso, including the flat helmet, fragmented racing stripe and grey rim. Newly drawn action limbs use cyan denim seams, white gloves and red shoes with white toe caps, white soles and grey undersides. All sixteen game pose names from `episodes/episode-1/src/sprites/characters.ts` are represented, with two additional run phases and one recoil frame. Climbing shows the back of the helmet and shirt.

The overworld is a separate top-down design on a 24 × 24 canvas with eight headings (N, NE, E, SE, S, SW, W, NW). Each heading has two walking frames. The helmet stripe, grey rim, brim and partial face indicate the heading; feet and hands alternate. This replaces the current head-and-shoulders interpretation for this study.

## Files

- `frames/`: all 35 individual transparent PNGs and editable pixel-rectangle SVGs.
- `animations/`: five action loops and eight overworld walk loops, each as an animated SVG and transparent GIF.
- `assets.json`: palette, every editable pixel grid, per-frame timing and sprite-sheet rectangles.
- `sheets/ben-poses.png`: transparent sprite sheet in 24 × 44 cells; use the rectangles in `assets.json` for smaller overworld frames.
- `build-assets.py`: standalone source generator. Requires Python 3 and Pillow; run `python3 build-assets.py` to regenerate exports.
- `original-study.png`: a copy of the original native study at 6× for comparison.

## Animation and integration notes

Run uses four phases at 140 ms each. Pogo alternates extension and compression at 180/140 ms with a fixed tip. Climbing uses two opposite arm/leg phases at 220 ms each. The pull-up preview shows grip, haul, push and a resting pose; the shooting preview adds a recoil frame. These are art preview timings, not changes to deterministic simulation timing. Animated SVGs honour reduced-motion preferences; GIF players control their own playback.

This is an external art workshop, not a game asset replacement. The taller side-view and new top-down dimensions differ from the current 16 × 24 side-view, 16 × 32 pogo and 16 × 16 overworld sprites. Integration would require deliberate atlas, draw-size and anchor review. The user interface, simulation and repository assets are unchanged.
''')
print(f'Built {len(FRAMES)} frames and {len(ANIMATIONS)} animation loops in {ROOT}')
