// each catalog part's footprint, height and top studs, and each catalog color's
// value, measured from the LDraw Parts Library by tools/pack-parts.ts -- do not edit
// ********************************************************************************
/** footprint in studs along x (`width`) and z (`depth`), height in plates, the LDraw
 *  origin in studs from the footprint's minimum corner, and the top-stud cells, all
 *  at rotation 0, keyed by LDraw file stem */
export const PART_GEOMETRY: Readonly<Record<string, Readonly<{ width: number; depth: number; height: number; origin: readonly [number, number]; studs: ReadonlyArray<readonly [number, number]>; }>>> = {"2431":{"width":4,"depth":1,"height":1,"origin":[2,0.5],"studs":[]},"2456":{"width":6,"depth":2,"height":3,"origin":[3,1],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1]]},"3001":{"width":4,"depth":2,"height":3,"origin":[2,1],"studs":[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]]},"3002":{"width":3,"depth":2,"height":3,"origin":[1.5,1],"studs":[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]},"3003":{"width":2,"depth":2,"height":3,"origin":[1,1],"studs":[[0,0],[1,0],[0,1],[1,1]]},"3004":{"width":2,"depth":1,"height":3,"origin":[1,0.5],"studs":[[0,0],[1,0]]},"3005":{"width":1,"depth":1,"height":3,"origin":[0.5,0.5],"studs":[[0,0]]},"3007":{"width":8,"depth":2,"height":3,"origin":[4,1],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1]]},"3008":{"width":8,"depth":1,"height":3,"origin":[4,0.5],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0]]},"3009":{"width":6,"depth":1,"height":3,"origin":[3,0.5],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]]},"3010":{"width":4,"depth":1,"height":3,"origin":[2,0.5],"studs":[[0,0],[1,0],[2,0],[3,0]]},"3020":{"width":4,"depth":2,"height":1,"origin":[2,1],"studs":[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]]},"3021":{"width":3,"depth":2,"height":1,"origin":[1.5,1],"studs":[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]},"3022":{"width":2,"depth":2,"height":1,"origin":[1,1],"studs":[[0,0],[1,0],[0,1],[1,1]]},"3024":{"width":1,"depth":1,"height":1,"origin":[0.5,0.5],"studs":[[0,0]]},"3031":{"width":4,"depth":4,"height":1,"origin":[2,2],"studs":[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2],[0,3],[1,3],[2,3],[3,3]]},"3034":{"width":8,"depth":2,"height":1,"origin":[4,1],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1]]},"3037":{"width":4,"depth":2,"height":3,"origin":[2,1.5],"studs":[[0,1],[1,1],[2,1],[3,1]]},"3038":{"width":3,"depth":2,"height":3,"origin":[1.5,1.5],"studs":[[0,1],[1,1],[2,1]]},"3039":{"width":2,"depth":2,"height":3,"origin":[1,1.5],"studs":[[0,1],[1,1]]},"3460":{"width":8,"depth":1,"height":1,"origin":[4,0.5],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0]]},"3622":{"width":3,"depth":1,"height":3,"origin":[1.5,0.5],"studs":[[0,0],[1,0],[2,0]]},"3623":{"width":3,"depth":1,"height":1,"origin":[1.5,0.5],"studs":[[0,0],[1,0],[2,0]]},"3666":{"width":6,"depth":1,"height":1,"origin":[3,0.5],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]]},"3710":{"width":4,"depth":1,"height":1,"origin":[2,0.5],"studs":[[0,0],[1,0],[2,0],[3,0]]},"3795":{"width":6,"depth":2,"height":1,"origin":[3,1],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1]]},"3958":{"width":6,"depth":6,"height":1,"origin":[3,3],"studs":[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[0,5],[1,5],[2,5],[3,5],[4,5],[5,5]]},"3023b":{"width":2,"depth":1,"height":1,"origin":[1,0.5],"studs":[[0,0],[1,0]]},"3070b":{"width":1,"depth":1,"height":1,"origin":[0.5,0.5],"studs":[]},"3069b":{"width":2,"depth":1,"height":1,"origin":[1,0.5],"studs":[]},"3068b":{"width":2,"depth":2,"height":1,"origin":[1,1],"studs":[]},"3040b":{"width":1,"depth":2,"height":3,"origin":[0.5,1.5],"studs":[[0,1]]}};

/** LDConfig color value, keyed by LDraw color code */
export const COLOR_VALUES: Readonly<Record<number, string>> = {
  "0": "#1B2A34",
  "1": "#1E5AA8",
  "2": "#00852B",
  "4": "#B40000",
  "5": "#D3359D",
  "10": "#58AB41",
  "14": "#FAC80A",
  "15": "#F4F4F4",
  "19": "#D7BA8C",
  "25": "#D67923",
  "27": "#A5CA18",
  "70": "#5F3109",
  "71": "#969696",
  "72": "#646464",
  "73": "#7396C8",
  "322": "#68C3E2"
};
