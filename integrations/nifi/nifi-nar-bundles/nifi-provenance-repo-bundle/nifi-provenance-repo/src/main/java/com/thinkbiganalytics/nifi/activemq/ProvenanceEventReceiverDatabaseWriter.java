package com.thinkbiganalytics.nifi.activemq;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.apache.commons.lang3.StringUtils;
import org.apache.nifi.provenance.ProvenanceEventRecord;
import org.apache.nifi.web.api.dto.provenance.ProvenanceEventDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.incrementer.DataFieldMaxValueIncrementer;
import org.springframework.jdbc.support.incrementer.MySQLMaxValueIncrementer;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;

/**
 * Created by sr186054 on 2/25/16. see mysql-schema.sql for db table scripts
 */
@Component
public class ProvenanceEventReceiverDatabaseWriter implements InitializingBean {

    private static final Logger logger = LoggerFactory.getLogger(ProvenanceEventReceiverDatabaseWriter.class);
    private DataFieldMaxValueIncrementer nifiProvenanceEventSequencer;

    @Autowired
    @Qualifier("jdbcThinkbigNifi")
    private JdbcTemplate jdbcTemplate;

    private static String NIFI_PROVENANCE_EVENT_TABLE = "NIFI_PROVENANCE_EVENT_JSON";

    @Override
    public void afterPropertiesSet() throws Exception {
    }


    /**
     * Write the Event to the Database Table
     */
    public void writeEvent(ProvenanceEventDTO event) throws Exception {
        logger.info("Writing event to temp table: " + event);
        Long eventId = event.getEventId();
        ObjectMapper mapper = new ObjectMapper();
        String json = mapper.writeValueAsString(event);
        String
            sql =
            "INSERT INTO " + NIFI_PROVENANCE_EVENT_TABLE
            + "(NIFI_EVENT_ID, JSON)"
            +
            "VALUES(?,?)";
        Object[] params = new Object[]{eventId, json};

        int[] types = new int[]{Types.BIGINT, Types.VARCHAR};
        jdbcTemplate.update(sql, params, types);
    }

    /**
     * Select the Events from the Database Table
     */
    public List<ProvenanceEventDTO> getEvents() throws Exception {
        logger.info("Getting the temporary events!!! ");

        List<ProvenanceEventDTO> events = this.jdbcTemplate.query(
            "SELECT NIFI_EVENT_ID, JSON from " + NIFI_PROVENANCE_EVENT_TABLE + " order by NIFI_EVENT_ID ASC",
            new RowMapper<ProvenanceEventDTO>() {
                public ProvenanceEventDTO mapRow(ResultSet rs, int rowNum) throws SQLException {
                    //long eventId = rs.getLong("NIFI_EVENT_ID");
                    String json = rs.getString("JSON");
                    ProvenanceEventDTO event = null;
                    try {
                        ObjectMapper mapper = new ObjectMapper();
                        event = mapper.readValue(json, ProvenanceEventDTO.class);
                    } catch (Exception ee) {
                        logger.error("Error marshalling the JSON back to the DTO", ee);
                    }
                    return event;
                }
            });

        return events;
    }

    /**
     * Clear the Events from the Database Table
     */
    public void clearEvents() throws Exception {
        logger.info("Clearing the temporary events!!! ");
        String sql = "DELETE FROM " + NIFI_PROVENANCE_EVENT_TABLE;
        jdbcTemplate.update(sql);
    }

    public void createTables() throws Exception {
        logger.info("Creating table for temporary storage ");
        String sql = "CREATE TABLE IF NOT EXISTS " + NIFI_PROVENANCE_EVENT_TABLE + "(" +
                     " NIFI_EVENT_ID BIGINT  NOT NULL, JSON TEXT);";

        jdbcTemplate.update(sql);
    }
}