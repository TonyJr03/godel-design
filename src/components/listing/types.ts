export type ListingFilterOption = {
  value: string;
  label: string;
};

export type ListingFilterConfig = {
  name: string;
  label: string;
  value: string;
  options: readonly ListingFilterOption[];
};

export type ActiveListingFilter = {
  key: string;
  label: string;
  valueLabel: string;
};
