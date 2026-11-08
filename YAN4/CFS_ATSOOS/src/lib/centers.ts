// CFS IB LIVE 상단 센터 전환과 같은 목록

/** 현재 센터 이름 표시용 (WMS 센터 ID → 코드) */
export const CENTER_NAMES: Record<string, string> = {
  "78": "GMH1",
  "81": "BUC2",
  "88": "YON3",
  "91": "PYT2",
  "105": "GON1",
  "121": "DAE4",
  "123": "INC11",
  "124": "INC15",
  "132": "INC17",
  "135": "YON5",
  "140": "GWJ3",
  "145": "SIH1",
  "148": "CHW2",
  "166": "INC12",
  "167": "INC22",
  "177": "GWJ1",
  "182": "DAJ1",
  "184": "INC37",
  "186": "INC39",
  "187": "INC31",
  "554": "SFJEJ2",
  "1007": "YAN4",
  "1015": "GYS1",
  "1016": "SEN2",
  "3056": "SFSPA3",
};

export const CENTER_REGIONS: [string, string[]][] = [
  ["Region1", ["BUC2", "INC11", "INC12", "INC15", "INC22", "INC37", "PYT2"]],
  ["Region2", ["GWJ1", "GWJ3", "SEN2", "SIH1", "YAN4", "YON5"]],
  ["Region3", ["CHW2", "DAE4", "DAJ1", "GMH1", "GON1", "GYS1"]],
];

export const DEFAULT_CENTER = "YAN4";

export function centerIdOf(name: string): string | undefined {
  return Object.keys(CENTER_NAMES).find((id) => CENTER_NAMES[id] === name);
}

export function isSelectableCenter(name: string | undefined): name is string {
  return !!name && CENTER_REGIONS.some(([, names]) => names.includes(name));
}
