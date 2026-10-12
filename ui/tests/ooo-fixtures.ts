// Rust-produced facts and intervals. Never classify OOO in a browser fixture.
import raw from './generated/ooo-presentation.json' with { type: 'json' };
import type { WeekPayload } from '../src/lib/api';
import type { EventDetail } from '../src/lib/eventdetail';

export const OOO = {
  week: raw.week as WeekPayload,
  controls: raw.controls as WeekPayload,
  partialWeek: raw.partial_week as WeekPayload,
  detail: raw.detail as EventDetail,
  partialDetail: raw.partial_detail as EventDetail,
  dstWeek: raw.dst_week as WeekPayload,
  dstMaster: raw.dst_master as EventDetail,
  dstDetails: raw.dst_details as EventDetail[],
};
