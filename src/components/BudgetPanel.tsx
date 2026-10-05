import { useMemo } from "react";
import { budgetOptions, fitToBudget } from "../lib/budget";
import { costTotal } from "../lib/plan";
import { yuan } from "../lib/format";
import type { Dataset, Plan, PlanInput } from "../lib/types";
import { BudgetField, type SetInput } from "./TripSettings";

export function BudgetPanel({ plan, data, set, setAll }: { plan: Plan; data: Dataset; set: SetInput; setAll: (next: PlanInput) => void }) {
  const input = plan.input;
  const total = costTotal(plan.costs);
  const over = input.budget != null && total > input.budget;
  const options = useMemo(() => (over ? budgetOptions(data, input).slice(0, 6) : []), [over, data, input]);
  const fit = useMemo(() => (over ? fitToBudget(data, input) : null), [over, data, input]);
  return (
    <div className={`card budget${over ? " over" : ""}`}>
      <div className="budget-row">
        <BudgetField input={input} set={set} />
        {input.budget != null && (
          <div className="budget-status">
            <div className="num big">{over ? `超出 ${yuan(total - input.budget)}` : `结余 ${yuan(input.budget - total)}`}</div>
            <div className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (total / input.budget) * 100)}%` }} /></div>
            <div className="muted small">预计 {yuan(total)} / 预算 {yuan(input.budget)}</div>
          </div>
        )}
      </div>
      {over && (
        <div className="budget-options">
          <h3>可以这样省</h3>
          <ul>
            {options.map((o) => (
              <li key={o.label}>
                <span>{o.label}</span>
                <span className="num muted">省 {yuan(o.saves)}</span>
                <button type="button" className="btn ghost" onClick={() => setAll({ ...input, ...o.change })}>采用</button>
              </li>
            ))}
          </ul>
          {fit && fit.labels.length > 1 && (
            <p className="small">
              组合采用「{fit.labels.join("」「")}」后约 {yuan(fit.total)}，{fit.fits ? "能控制在预算内" : "仍超出预算，需要缩短行程或提高预算"}。{" "}
              <button type="button" className="link" onClick={() => setAll({ ...input, ...fit.change })}>全部采用</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
