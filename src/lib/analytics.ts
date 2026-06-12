export type TrackParams = Record<string, unknown>;

type DataLayerEvent = Record<string, unknown> & {
  event?: string;
};

declare global {
  interface Window {
    dataLayer?: Array<DataLayerEvent>;
  }
}

const ensureDataLayer = (): Window['dataLayer'] => {
  if (typeof window === 'undefined') {
    return [];
  }

  if (!Array.isArray(window.dataLayer)) {
    window.dataLayer = [];
  }

  return window.dataLayer;
};

export const pushAnalyticsEvent = (eventName: string, params: TrackParams = {}) => {
  if (!eventName || typeof eventName !== 'string') {
    return;
  }

  const payload: DataLayerEvent = {
    event: eventName,
    ...params,
  };

  const dataLayer = ensureDataLayer();
  dataLayer.push(payload);
};

export const trackEvent = (eventName: string, params: TrackParams = {}) => pushAnalyticsEvent(eventName, params);

export const trackFormSubmit = (eventName = 'form_submit', params: TrackParams = {}) => {
  pushAnalyticsEvent(eventName, {
    event_category: 'form',
    ...params,
  });
};

export const trackClick = (label: string, params: TrackParams = {}) => {
  pushAnalyticsEvent('cta_click', {
    event_category: 'engagement',
    event_label: label,
    ...params,
  });
};

export const trackPageView = (params: TrackParams = {}) => {
  pushAnalyticsEvent('page_view', params);
};
