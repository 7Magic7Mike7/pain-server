/**
 * Configures all values required to correctly connect and work with the database tables 
 * associated with pain values.
 */
export class PainDbConfig {
  // table names (lowercase)
  static readonly TN_EMO = process.env.TN_EMO?.toLowerCase() ?? "emopain";
  static readonly TN_ENV = process.env.TN_ENV?.toLowerCase() ?? "envpain";
  static readonly TN_PHYS = process.env.TN_PHYS?.toLowerCase() ?? "physpain";
  static readonly TN_SOCIOECO = process.env.TN_SOCIOECO?.toLowerCase() ?? "socioecopain";
  static readonly TN_EXPERIMENTAL = process.env.TN_EXPERIMENTAL?.toLowerCase() ?? "experimentalpain";

  // column names
  static readonly COL_ID = process.env.COL_ID || 'id';
  static readonly COL_AGGRID = process.env.COL_AGGRID || 'aggrId';
  static readonly COL_VALUE = process.env.COL_VALUE || 'value';
  static readonly COL_CATEGORY = process.env.COL_CATEGORY || 'category';
  static readonly COL_COUNTRY = process.env.COL_COUNTRY || 'country';
  static readonly COL_LAT = process.env.COL_LAT || 'lat';
  static readonly COL_LNG = process.env.COL_LNG || 'lng';
  static readonly COL_WORD = process.env.COL_WORD || 'word';
  
  private PainDbConfig() { }

  static toString(): string {
    return `PainDBConfig {
      Table Names: [ ${PainDbConfig.TN_EMO}, ${PainDbConfig.TN_ENV}, ${PainDbConfig.TN_PHYS}, ${PainDbConfig.TN_SOCIOECO}, ${PainDbConfig.TN_EXPERIMENTAL} ],
      Column Names: [ ${PainDbConfig.COL_ID}, ${PainDbConfig.COL_AGGRID}, ${PainDbConfig.COL_VALUE}, ${PainDbConfig.COL_CATEGORY}, ${PainDbConfig.COL_COUNTRY}, ${PainDbConfig.COL_LAT}, ${PainDbConfig.COL_LNG}, ${PainDbConfig.COL_WORD} ]
    }`
  }
}

export class UserDbConfig {
  static readonly TN_USERS = process.env.TNM_USERS?.toLowerCase() ?? "users";
  static readonly TN_TOGGLE = process.env.TNM_TOGGLE?.toLowerCase() ?? "togglemetrics";
  static readonly TN_STEP = process.env.TNM_STEP?.toLowerCase() ?? "stepmetrics";
  static readonly TN_VIS = process.env.TNM_VIS?.toLowerCase() ?? "vizmetrics";

  // column names
  static readonly COL_ID = process.env.COL_ID?.toLowerCase() ?? 'id';
  static readonly COL_DT = process.env.COL_DT?.toLowerCase() ?? 'datetime';
  static readonly COL_USER_ID = process.env.COL_USER_ID?.toLowerCase() ?? 'userId';
  static readonly COL_KIND = process.env.COL_KIND?.toLowerCase() ?? 'kind';
  static readonly COL_ELEM = process.env.COL_ELEM?.toLowerCase() ?? 'element';
  static readonly COL_ENABLED = process.env.COL_ENABLED?.toLowerCase() ?? 'enabled';
  static readonly COL_STEP = process.env.COL_STEP?.toLowerCase() ?? 'step';
  static readonly COL_VIS_MODE = process.env.COL_VIS_MODE?.toLowerCase() ?? 'mode';

  private UserDbConfig() { }
}
