export type DateTimeFieldProps = {
  date: string;
  time?: string;
  onChange: (date: string, time: string) => void;
};
