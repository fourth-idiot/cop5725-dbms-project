var express = require('express');
var router = express.Router();
const oracledb = require('oracledb')
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECT_STRING
}

////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// Query 1:  US Hospitalization trend
////////////////////////////////////////////////////////////////////////////////

async function usHospitalizationTrend (req, res) {
  let connection, result;
  try {
    // Parse user input
    let fromDate = req.body.fromDate;
    let toDate = req.body.toDate;
    let id = req.body.id;
    console.log(fromDate, toDate, id);
    // // Construct SQL statement
    // let sql = `
    // SELECT fsid AS "STATE_ID", fsn AS "State Name", tab AS "Total Beds", cbo AS "COVID_ICU_BED_OCCUPANCY", tpc AS "Total Positive Cases", td AS "Total Deaths", dt AS "RECORD_DATE"
    // FROM 
    // (
    //     WITH bedinfo (sid, rd, tb, coib) AS
    //     (
    //         SELECT hd.STATE_ID, hd.RECORD_DATE, SUM(hd.TOTAL_BEDS), SUM(hd.COVID_OCCUPIED_ICU_BEDS) FROM "N.SAOJI".HOSPITALIZATION_DATA hd, "N.SAOJI".STATE s 
    //         WHERE hd.STATE_ID = s.ID
    //         GROUP BY hd.STATE_ID, hd.RECORD_DATE
    //     ),
    //     deathinfo (sid2, rd2, dpc, dd) AS
    //     (
    //         SELECT s.ID, ccd.RECORD_DATE, SUM(ccd.DAILY_POSITIVE_CASES), SUM(ccd.DAILY_DEATHS) FROM "N.SAOJI".STATE s, "N.SAOJI".COUNTY c , "N.SAOJI".COUNTY_COVID_DATA ccd 
    //         WHERE s.ID = c.STATE_ID AND c.ID = ccd.COUNTY_ID
    //         GROUP BY s.ID , ccd.RECORD_DATE 
    //     )
    //     SELECT s2.ID AS fsid, s2.NAME AS fsn, bi.tb AS tab, bi.coib AS cbo, di.dpc AS tpc, di.dd AS td, bi.rd AS dt
    //     FROM "N.SAOJI".STATE s2, bedinfo bi, deathinfo di
    //     WHERE s2.ID = bi.sid AND bi.sid = di.sid2 AND bi.rd = di.rd2
    // )
    // WHERE dt BETWEEN \'${fromDate}' AND \'${toDate}' AND fsid IN (${id})
    // ORDER BY fsn ASC, dt ASC
    // `;
    let sql = `
    SELECT fsid AS "State ID", fname AS state_name, dt AS record_date, taib AS "Total ICU Beds", taicb AS "Covid ICU Bed Occupancy", 
    prtb AS percentage_of_covid_bed_coverage_vs_icu_bed, tpc AS "Total Positive Cases", td AS "Total Covid Deaths"
    FROM 
    (
        WITH bedinfo (sid, rd, icb, ctb, icbc, ctbc, fctbib) AS
        (
            SELECT hd.STATE_ID, hd.RECORD_DATE, SUM(hd.ICU_BEDS), SUM(hd.COVID_OCCUPIED_ICU_BEDS), SUM(hd.ICU_BEDS_COVERAGE), 
            SUM(hd.COVID_OCCUPIED_ICU_BEDS_COVERAGE), 
            ROUND(SUM(hd.COVID_OCCUPIED_ICU_BEDS) * (SUM(hd.ICU_BEDS_COVERAGE)/SUM(hd.COVID_OCCUPIED_ICU_BEDS_COVERAGE))) AS fctbib
        FROM "N.SAOJI".HOSPITALIZATION_DATA hd, "N.SAOJI".STATE s3  
        WHERE s3.ID = hd.STATE_ID AND hd.ICU_BEDS IS NOT NULL AND hd.COVID_OCCUPIED_ICU_BEDS IS NOT NULL AND hd.ICU_BEDS != 0 
        GROUP BY hd.STATE_ID, hd.RECORD_DATE
        ),
        deathinfo (sid2, rd2, dpc, dd) AS
        (
            SELECT s.ID, ccd.RECORD_DATE, SUM(ccd.DAILY_POSITIVE_CASES), SUM(ccd.DAILY_DEATHS) 
            FROM "N.SAOJI".STATE s, "N.SAOJI".COUNTY c , "N.SAOJI".COUNTY_COVID_DATA ccd 
            WHERE s.ID = c.STATE_ID AND c.ID = ccd.COUNTY_ID
            GROUP BY s.ID , ccd.RECORD_DATE 
        )
        SELECT s2.ID AS fsid, s2.NAME AS fname, bi.rd AS dt, bi.icb AS taib, bi.ctb AS taicb, bi.icbc AS taibc, bi.ctbc AS taicbc,
        ROUND((bi.ctb/bi.icb)*100, 4) AS ptb, ROUND((fctbib/icb)*100, 4) AS prtb, di.dpc AS tpc, di.dd AS td
        FROM "N.SAOJI".STATE s2, bedinfo bi, deathinfo di
        WHERE s2.ID = bi.sid AND bi.sid = di.sid2 AND bi.rd = di.rd2 
    )
    WHERE dt BETWEEN '${fromDate}' AND '${toDate}' AND fsid IN (${id})
    ORDER BY fsid ASC, dt ASC
    `
    
    // Creat db connection
    connection = await oracledb.getConnection(config);
    result = await connection.execute(sql, [], {outFormat: oracledb.OUT_FORMAT_OBJECT});
  } catch (err) {
    // Display error message
    console.log('[Error] ', err);
    return res.json(err)
  } finally {
    // Display results
    if(connection) {
      await connection.close();
      return res.json(result.rows);
    }
  }
};

async function usHospitalizationSummary (req, res) {
  let connection, result;
  try {
    // Parse user input
    let fromDate = req.body.fromDate;
    let toDate = req.body.toDate;
    let id = req.body.id;
    // Construct SQL statement
    let sql = `SELECT ftb AS "Total Number of Beds", (ftb/ftp)*1000 AS "Percentage of beds per thousand",
    fib AS "Total Covid Beds", (fib/ftp)*1000 AS "Percentage of covid beds per thousand",
    fcb AS "Total Covid ICU Beds", (fcb/ftp)*1000 AS "Percentage of covid icu beds per thousand" 
    FROM 
    (
        SELECT SUM(tb) AS ftb, SUM(ticb) AS fib, SUM(tcicb) AS fcb, SUM(tp) AS ftp FROM 
        (
            SELECT s.ID, SUM(hd.TOTAL_BEDS) AS tb, SUM(hd.ICU_BEDS) AS ticb, SUM(hd.COVID_OCCUPIED_ICU_BEDS) AS tcicb, SUM(c.POPULATION) AS tp
            FROM "N.SAOJI".STATE s , "N.SAOJI".HOSPITALIZATION_DATA hd , "N.SAOJI".COUNTY c 
            WHERE s.ID = hd.STATE_ID AND s.ID = c.STATE_ID 
            GROUP BY s.ID
        )
    )
    `
    // Creat db connection
    connection = await oracledb.getConnection(config);
    result = await connection.execute(sql, [], {outFormat: oracledb.OUT_FORMAT_OBJECT});
  } catch (err) {
    // Display error message
    console.log('[Error] ', err);
    return res.json(err)
  } finally {
    // Display results
    if(connection) {
      await connection.close();
      return res.json(result.rows);
    }
  }
};

router.post('/hospitalization-trend', function (req, res) {
  console.log("[INFO] POST /api/hospitalization/hospitalization-trend route...");
  usHospitalizationTrend(req, res);
})

router.post('/us-hospitalization-summary', function (req, res) {
  console.log("[INFO] POST /api/hospitalization/us-hospitalization-summary route...");
  usHospitalizationSummary(req, res);
})

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

module.exports = router;
