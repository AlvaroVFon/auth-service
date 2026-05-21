export interface Tenant {
  _id: string;
  name: string;
  active: boolean;
  description: string;
  secret: string;
}
