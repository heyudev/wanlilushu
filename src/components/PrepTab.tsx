import type { ReactNode } from "react";
import type { Dataset, Plan } from "../lib/types";
import { DogGuide, PolicyGuide, VehicleGuide, WinterList } from "./Guides";
import { Packing } from "./Packing";
import { Sources } from "./Sources";
import { Warnings } from "./Warnings";

function Fold({ title, sub, children, open }: { title: string; sub?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="fold-sec" open={open}>
      <summary><span><b>{title}</b>{sub && <span className="muted small"> {sub}</span>}</span><span className="chev" aria-hidden="true" /></summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export function PrepTab({ plan, data, onOpenStop }: { plan: Plan; data: Dataset; onOpenStop: (id: string) => void }) {
  return (
    <div className="prep-tab">
      <section>
        <h2 className="sec-title">出发前必须知道</h2>
        <Warnings plan={plan} data={data} onSelectStop={onOpenStop} />
      </section>
      <Fold title="装备清单" sub="按你的行程自动增减，勾选会保存在本机">
        <Packing plan={plan} />
      </Fold>
      <Fold title="证件、政策与路况" sub="边境管理区通行证、独库公路、新藏线、油价与过路费">
        <PolicyGuide />
      </Fold>
      {plan.input.dog && (
        <Fold title="带狗出行" sub="法规、景区禁宠名单与建议">
          <DogGuide data={data} />
        </Fold>
      )}
      <Fold title="混动车怎么跑全国" sub="补能、高原山路、保养、分段走">
        <VehicleGuide />
      </Fold>
      <Fold title="季节扩展" sub="主环线避开季节的地方，适合另外几趟短线">
        <WinterList />
      </Fold>
      <Fold title="数据来源与图片署名">
        <Sources data={data} />
      </Fold>
    </div>
  );
}
