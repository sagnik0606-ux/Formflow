import oracledb from "oracledb";

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [ oracledb.CLOB ];

export async function getConnection() {
    return await oracledb.getConnection({
        user: "sagnik",
        password: "sagnik123",
        connectString: "localhost:1521/XEPDB1"
    });
}