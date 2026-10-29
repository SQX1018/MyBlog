/** Dimensions in millimetres. Crystal geometry follows the minimal VLAST-P scheme. */
export const ECAL = {
  rows: 5,
  columns: 5,
  crystal: { width: 60, depth: 60, height: 150 },
} as const;

export const crystals = Array.from(
  { length: ECAL.rows * ECAL.columns },
  (_, index) => ({
    id: `C${String(index + 1).padStart(2, "0")}`,
    row: Math.floor(index / ECAL.columns),
    column: index % ECAL.columns,
  })
);

export const parts = [
  {
    id: "crystals",
    name: "CsI(Tl) 晶体",
    short: "晶体阵列",
    color: "#ad822c",
    summary: "25 根晶体接收入射粒子，把部分沉积能量转成闪烁光。",
    description:
      "25 根掺铊碘化铯晶体组成 5 × 5 阵列。粒子在晶体中沉积能量，晶体将其中一部分能量转换为闪烁光。",
    detail:
      "单根 60 × 60 × 150 mm；阵列标称 300 × 300 × 150 mm，不含包装和支撑结构。",
  },
  {
    id: "apd",
    name: "APD 光电读出",
    short: "APD 组件",
    color: "#976ba5",
    summary: "位于晶体底部，接收闪烁光并将其转换为电信号。",
    description:
      "雪崩光电二极管位于晶体底部，接收闪烁光并将其转换为电信号，利用内部雪崩倍增提高信号幅度。",
    detail: "模型显示底部光电耦合关系；器件封装、数量和安装细节作结构示意。",
  },
  {
    id: "fam",
    name: "FAM 前端模拟电路",
    short: "FAM 前端",
    color: "#407866",
    summary: "接收 APD 的电信号，完成前端模拟处理。",
    description:
      "前端模拟模块接收 APD 的信号，完成电荷灵敏放大、极零相消和模拟加和，为后续数字化读出做准备。",
    detail: "每个晶体下方的电路板用于表达信号链，板形和元件布局经过简化。",
  },
  {
    id: "fee",
    name: "FEE 读出电子学",
    short: "FEE 读出",
    color: "#4876a3",
    summary: "将前端模拟信号送入高、低增益通路并数字化。",
    description:
      "读出电子学对多路 FAM 信号进行数字化。高、低增益通路共同覆盖较宽的信号动态范围。",
    detail: "侧面的电路板表示读出功能；板卡尺寸、通道布置和走线为示意。",
  },
  {
    id: "support",
    name: "机械支撑与底座",
    short: "支撑结构",
    color: "#77848e",
    summary: "边框与底座固定晶体和读出组件，保持它们的位置关系。",
    description:
      "边框、立柱和底座保持晶体阵列及读出组件的位置关系，并为整机安装提供机械接口。",
    detail: "外形参考研制报告中的初步装配方案，未还原工程公差及紧固件细节。",
  },
] as const;

export type PartId = (typeof parts)[number]["id"];

export const steps = [
  {
    title: "入射与能量沉积",
    short: "能量沉积",
    summary: "入射伽马光子在晶体中相互作用，产生次级粒子并沉积能量。",
    description:
      "以一个在晶体内发生相互作用的高能伽马光子为例：产生的次级带电粒子继续传播，将能量沉积在一根或多根晶体中。图中的分支仅表示这一过程。",
    part: "crystals",
  },
  {
    title: "晶体发出闪烁光",
    short: "晶体闪烁",
    summary: "部分沉积能量变成闪烁光，其中一部分传播到底部。",
    description:
      "CsI(Tl) 把部分沉积能量转换为可见光。闪烁光在晶体中传播，其中一部分到达底部的光电读出端。光点的数量与传播路径均为定性示意。",
    part: "crystals",
  },
  {
    title: "APD 将光变成电信号",
    short: "光电转换",
    summary: "闪烁光到达 APD，在这里转换为电信号。",
    description:
      "到达 APD 的光产生光生载流子，经过雪崩倍增形成更易测量的电信号，再送入前端模拟电路。",
    part: "apd",
  },
  {
    title: "放大、整形与数字化",
    short: "电子学读出",
    summary: "电信号经 FAM 模拟处理，再由 FEE 数字化。",
    description:
      "FAM 处理模拟信号，FEE 通过高、低增益通路及 ADC 进行数字化。经刻度与重建后，这些信号才成为对沉积能量的估计。",
    part: "fee",
  },
] as const;
