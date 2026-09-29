import sys
from render import *

WOOD = load_tex('ECBO-2447M.png', 47, 24, ppi=8)          # white-oak look for vanity face
QTZ = load_tex('TCA-2448P_1.jpg', 24, 48, ppi=6)          # soft white quartz look
ALABASTER = [0.93, 0.91, 0.86]   # SW 7008 Alabaster
BRASS = [0.80, 0.64, 0.38]

def fl(name, w, h, off, grout, crop=None, along_z=False):
    return dict(tex=load_tex(name, w, h, crop=crop), w=w, h=h, off=off, grout=grout, along_z=along_z)

EKOT = fl('EKOT-0915.png', 15, 9, 0, (0.55, 0.52, 0.47), crop=(8, 8, 676, 410))

SCHEMES = {
 'A': dict(floor=fl('TCL-2424P_1.jpg', 24, 24, 0.0, (0.80, 0.80, 0.79)),
           wall=fl('TCD-2448P_1.jpg', 48, 24, 1/3, (0.90, 0.89, 0.86)), niche=EKOT),
 'B': dict(floor=fl('ECBO-2447M.png', 47, 24, 1/3, (0.62, 0.55, 0.46), along_z=True),
           wall=fl('TCA-2448P_1.jpg', 48, 24, 1/3, (0.90, 0.88, 0.84)), niche=EKOT),
 'C': dict(floor=fl('MSMS-1224.jpg', 24, 12, 1/3, (0.66, 0.63, 0.59)),
           wall=fl('MSGW-2448M.jpg', 48, 24, 1/3, (0.88, 0.86, 0.82)),
           niche=fl('MSGW-2448M.jpg', 48, 24, 0, (0.88, 0.86, 0.82))),
 'D': dict(floor=fl('ESP-1224M.jpg', 24, 12, 1/3, (0.70, 0.68, 0.66)),
           wall=fl('TCP-2448P_1.jpg', 48, 24, 1/3, (0.90, 0.89, 0.86)), niche=EKOT),
}
for k, s in SCHEMES.items():
    s.update(paint=ALABASTER, metal=BRASS, wood=WOOD, qtex=QTZ, quartz=[0.95, 0.94, 0.92],
             mat=[0.86, 0.80, 0.70], mat2=[0.72, 0.62, 0.50], towel=[0.93, 0.90, 0.84])

if __name__ == '__main__':
    which = sys.argv[1]; w = int(sys.argv[2]) if len(sys.argv) > 2 else 1200
    render(SCHEMES[which], f'render_{which}.jpg', w=w, h=w * 3 // 4, ss=int(sys.argv[3]) if len(sys.argv) > 3 else 2)
