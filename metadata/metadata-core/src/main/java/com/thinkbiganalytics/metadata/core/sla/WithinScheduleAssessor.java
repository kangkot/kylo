/**
 * 
 */
package com.thinkbiganalytics.metadata.core.sla;

import java.io.Serializable;

import org.joda.time.DateTime;

import com.thinkbiganalytics.metadata.api.sla.WithinSchedule;
import com.thinkbiganalytics.metadata.core.sla.feed.MetadataMetricAssessor;
import com.thinkbiganalytics.metadata.sla.api.AssessmentResult;
import com.thinkbiganalytics.metadata.sla.api.Metric;
import com.thinkbiganalytics.metadata.sla.spi.MetricAssessmentBuilder;
import com.thinkbiganalytics.scheduler.util.CronExpressionUtil;

/**
 *
 * @author Sean Felten
 */
public class WithinScheduleAssessor extends MetadataMetricAssessor<WithinSchedule> {

    @Override
    public boolean accepts(Metric metric) {
        return metric instanceof WithinSchedule;
    }

    @Override
    public void assess(WithinSchedule metric, 
                       MetricAssessmentBuilder<Serializable> builder) {
        DateTime start = new DateTime(CronExpressionUtil.getPreviousFireTime(metric.getCronExpression()));
        DateTime end = start.withPeriodAdded(metric.getPeriod(), 1);
        
        builder.metric(metric);
        
        if (start.isBeforeNow() && end.isAfterNow()) {
            builder
                .result(AssessmentResult.SUCCESS)
                .message("Current time falls between the schedule " + start + " - " + end);
        } else {
            builder
                .result(AssessmentResult.FAILURE)
                .message("Current time does not falls between the schedule " + start + " - " + end);
        }
    }
}
