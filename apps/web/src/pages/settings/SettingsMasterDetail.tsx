import type { ReactNode } from 'react';

type SettingsMasterDetailProps = {
  list: ReactNode;
  detail: ReactNode;
  wideDetail?: boolean;
};

export function SettingsMasterDetail({ list, detail, wideDetail }: SettingsMasterDetailProps) {
  return (
    <div className={`settings-master-detail${wideDetail ? ' settings-master-detail--wide' : ''}`}>
      <div className="settings-master-detail__list">{list}</div>
      <div className="settings-master-detail__detail">{detail}</div>
    </div>
  );
}
