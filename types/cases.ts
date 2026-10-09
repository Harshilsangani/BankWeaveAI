import type { QueryContext } from './index';
export interface InvestigationCase {
  investigation_id:string;
  owner:string;
  status:'In review'|'Monitoring'|'Resolved';
  revision:number;
  scope:QueryContext;
  events:{id:string;actor_id:string;kind:string;note:string;source_scope:string;created_at:string}[];
}
