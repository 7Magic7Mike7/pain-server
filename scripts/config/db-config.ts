
export class DbConfig {
  static readonly TABLE_NAME = process.env.TABLE_NAME || 'DummyPain';
  static readonly TABLE_COLUMN_ID = process.env.COL_ID || 'id';
  static readonly TABLE_COLUMN_LAT = process.env.COL_LAT || 'lat';
  static readonly TABLE_COLUMN_LNG = process.env.COL_LNG || 'lng';
  static readonly TABLE_COLUMN_VALUE = process.env.COL_VALUE || 'value';
  static readonly TABLE_COLUMN_DATATYPE = process.env.COL_DATATYPE || 'datatype';
  static readonly TABLE_COLUMN_PAINORIGIN = process.env.COL_PAINORIGIN || 'painorigin';
  
  static readonly PO_EMO = "emo";
  static readonly PO_ENV = "env";
  static readonly PO_ENV_NAT = "envnat";
  static readonly PO_ENV_ANTRO = "envantro";
  static readonly PO_PHYS = "phys";
  static readonly PO_SOCIOECO = "socioeco";

  private DbConfig() { }
}
