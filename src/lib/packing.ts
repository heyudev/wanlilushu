// Packing list. Items carry a condition so the list follows the plan (dog, camping, plateau, plug-in).
import type { Plan } from "./types";

export type PackTag = "always" | "dog" | "camp" | "plateau" | "phev";

export interface PackGroup {
  title: string;
  tag: PackTag;
  items: string[];
}

export const PACKING: PackGroup[] = [
  { title: "证件与文件", tag: "always", items: [
    "身份证（每人）", "驾驶证、行驶证原件", "车险电子保单与道路救援电话", "电子边境管理区通行证（截图离线保存）",
    "证件复印件一套、证件照若干", "常用 App 离线地图包（高德/奥维）",
  ] },
  { title: "车辆与救援", tag: "always", items: [
    "三角警示牌、反光背心", "车载灭火器", "车载充气泵（带胎压表）", "补胎工具（蘑菇钉或补胎液）",
    "拖车绳（5 吨以上）", "应急启动电源或搭电线", "防滑链（川西、西藏、东北秋冬）", "折叠铁锹、脱困板（沙地雪地）",
    "防冻玻璃水", "头灯 ×2、备用电池", "行车记录仪（前后）",
  ] },
  { title: "插电混动补能", tag: "phev", items: [
    "随车充电枪（便携充）", "户外防水插线板（10m）", "常用充电 App（国网 e 充电、特来电、星星充电等）",
  ] },
  { title: "露营与车宿", tag: "camp", items: [
    "抗风帐篷（高原选四季帐）", "睡袋（舒适温标 −5℃ 以下，高原 −10℃）", "充气床垫或防潮垫", "车窗遮光帘 + 纱窗",
    "营地灯", "折叠桌椅", "卡式炉 / 户外炉 + 气罐（高原用高山气罐）", "锅具餐具、洗洁精", "车载冰箱",
    "户外电源（1000Wh 以上）", "20L 水桶", "垃圾袋（无痕露营，垃圾带走）",
  ] },
  { title: "高原", tag: "plateau", items: [
    "指夹血氧仪", "便携氧气（进藏后当地购买）", "防晒霜 SPF50+、UV400 墨镜、遮阳帽", "抓绒 + 冲锋衣 + 羽绒服",
    "润唇膏、保湿霜", "高反药物（出发前咨询医生）",
  ] },
  { title: "衣物", tag: "always", items: [
    "速干衣裤", "冲锋衣", "轻羽绒（北方、高原早晚）", "雨衣或折叠伞", "徒步鞋、拖鞋", "帽子、手套",
  ] },
  { title: "药品", tag: "always", items: [
    "感冒、肠胃、止痛、抗过敏常用药", "创可贴、碘伏、纱布、弹力绷带", "晕车药", "驱蚊液、止痒膏", "个人处方药（按天数备足）",
  ] },
  { title: "狗狗", tag: "dog", items: [
    "狂犬疫苗免疫证明、犬证（原件 + 照片）", "动物检疫合格证明（出发前在当地申报）", "常吃的狗粮（备足到下个大城市）",
    "折叠水碗、饮用水", "牵引绳 + 备用一根", "嘴套（部分城市和场所要求）", "拾便袋", "车载安全带或航空箱",
    "狗垫 / 睡垫", "狗狗外套（高原、北方夜里）", "降温背心或冰垫（南疆、吐鲁番夏天）", "体内外驱虫药（出发前做一次）",
    "宠物急救包（纱布、生理盐水，药物遵兽医）", "宠物 GPS 定位器、写有电话的狗牌", "沿途城市宠物医院清单",
  ] },
];

export function packingFor(plan: Plan): PackGroup[] {
  const plateau = plan.stops.some((s) => (s.node.alt ?? 0) >= 3000);
  const on: Record<PackTag, boolean> = {
    always: true,
    dog: plan.input.dog,
    camp: plan.input.lodging !== "comfort",
    plateau,
    phev: plan.input.vehicle === "phev",
  };
  return PACKING.filter((g) => on[g.tag]);
}
