package com.thinkbiganalytics.nifi.feedmgr;

import com.google.common.collect.Lists;
import com.thinkbiganalytics.nifi.rest.client.NifiRestClient;
import com.thinkbiganalytics.nifi.rest.model.ControllerServicePropertyHolder;
import com.thinkbiganalytics.nifi.rest.model.NifiError;
import com.thinkbiganalytics.nifi.rest.model.NifiProcessGroup;
import com.thinkbiganalytics.nifi.rest.support.NifiProcessUtil;
import com.thinkbiganalytics.rest.JerseyClientException;
import org.apache.commons.lang3.StringUtils;
import org.apache.nifi.web.api.dto.ProcessGroupDTO;
import org.apache.nifi.web.api.dto.ProcessorDTO;
import org.apache.nifi.web.api.dto.TemplateDTO;
import org.apache.nifi.web.api.entity.ProcessGroupEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Created by sr186054 on 5/6/16.
 */
public class TemplateInstanceCreator {
    private static final Logger log = LoggerFactory.getLogger(TemplateInstanceCreator.class);

    private String templateId;
    private NifiRestClient restClient;

    private boolean createReusableFlow;

    public TemplateInstanceCreator(NifiRestClient restClient, String templateId, boolean createReusableFlow) {
        this.restClient = restClient;
        this.templateId = templateId;
        this.createReusableFlow = createReusableFlow;
    }

    public boolean isCreateReusableFlow() {
        return createReusableFlow;
    }

    private void ensureInputPortsForReuseableTemplate(String processGroupId) throws JerseyClientException {
        ProcessGroupEntity template = restClient.getProcessGroup(processGroupId, false, false);
        String categoryId = template.getProcessGroup().getParentGroupId();
        restClient.createReusableTemplateInputPort(categoryId, processGroupId);
    }



    public NifiProcessGroup createTemplate() throws JerseyClientException {

        NifiProcessGroup newProcessGroup = null;
        TemplateDTO template = restClient.getTemplateById(templateId);

        if (template != null) {

            TemplateCreationHelper templateCreationHelper = new TemplateCreationHelper(this.restClient);
            String processGroupId = null;

            ProcessGroupEntity group = null;
            if(isCreateReusableFlow()){
                log.info("Creating a new Reusable flow instance for template: {} ",template.getName());
                //1 get/create the parent "reusable_templates" processgroup
                ProcessGroupDTO reusableParentGroup = restClient.getProcessGroupByName("root", TemplateCreationHelper.REUSABLE_TEMPLATES_PROCESS_GROUP_NAME);
                if(reusableParentGroup == null){
                    reusableParentGroup = restClient.createProcessGroup("root",TemplateCreationHelper.REUSABLE_TEMPLATES_PROCESS_GROUP_NAME).getProcessGroup();
                }
                ProcessGroupDTO thisGroup = restClient.getProcessGroupByName(reusableParentGroup.getId(), template.getName());
                if(thisGroup != null){
                    //version the group
                    log.info("A previous Process group of with this name {} was found.  Versioning it before continuing",thisGroup.getName());
                    templateCreationHelper.versionProcessGroup(thisGroup);

                }
                group = restClient.createProcessGroup(reusableParentGroup.getId(),template.getName());
            }
            else {
                String tmpName = template.getName() + "_" + System.currentTimeMillis();
             group   =restClient.createProcessGroup(tmpName);
                log.info("Creating a temporary process group with name {} for template {} ",tmpName, template.getName());
            }
            processGroupId = group.getProcessGroup().getId();
            if (StringUtils.isNotBlank(processGroupId)) {
                //snapshot the existing controller services
                templateCreationHelper.snapshotControllerServiceReferences();
                log.info("Successfully Snapshot of controller services");
                //create the flow from the template
                templateCreationHelper.instantiateFlowFromTemplate(processGroupId, templateId);
                log.info("Successfully created the temp flow");

                if (this.createReusableFlow) {
                    ensureInputPortsForReuseableTemplate(processGroupId);
                    log.info("Reusable flow, input ports created successfully.");
                }

                //mark the new services that were created as a result of creating the new flow from the template
                templateCreationHelper.identifyNewlyCreatedControllerServiceReferences();

                ProcessGroupEntity entity = restClient.getProcessGroup(processGroupId, true, true);

                //identify the various processors (first level initial processors)
                List<ProcessorDTO> inputProcessors = NifiProcessUtil.getInputProcessors(entity.getProcessGroup());

                ProcessorDTO input =null;
                List<ProcessorDTO> nonInputProcessors = NifiProcessUtil.getNonInputProcessors(entity.getProcessGroup());

                //if the input is null attempt to get the first input available on the template
                if (input == null && inputProcessors != null && !inputProcessors.isEmpty()) {
                    input = inputProcessors.get(0);
                }

                log.info("Attempt to update/validate controller services for template.");
                //update any references to the controller services and try to assign the value to an enabled service if it is not already
                if (input != null) {
                    log.info("attempt to update controllerservices on {} input processor ",input.getName());
                    templateCreationHelper.updateControllerServiceReferences(Lists.newArrayList(input));
                }
                log.info("attempt to update controllerservices on {} processors ",(nonInputProcessors != null ? nonInputProcessors.size() : 0));
                templateCreationHelper.updateControllerServiceReferences(nonInputProcessors);
                log.info("Controller service validation complete");
                //refetch processors for updated errors
                entity = restClient.getProcessGroup(processGroupId, true, true);
                nonInputProcessors = NifiProcessUtil.getNonInputProcessors(entity.getProcessGroup());



                ///make the input/output ports in the category group as running
                if(isCreateReusableFlow())
                {
                    log.info("Reusable flow, attempt to mark the connection ports as running.");
                    templateCreationHelper.markConnectionPortsAsRunning(entity);
                    log.info("Reusable flow.  Successfully marked the ports as running.");
                }


                newProcessGroup = new NifiProcessGroup(entity, input, nonInputProcessors);

                if(isCreateReusableFlow()) {
                    log.info("Reusable flow, attempt to mark the Processors as running.");
                    templateCreationHelper.markProcessorsAsRunning(newProcessGroup);
                    log.info("Reusable flow.  Successfully marked the Processors as running.");
                }

                 templateCreationHelper.cleanupControllerServices();
                log.info("Controller service cleanup complete");
                List<NifiError> errors = templateCreationHelper.getErrors();
                    //add any global errors to the object
                    if (errors != null && !errors.isEmpty()) {
                        for (NifiError error : errors) {
                            newProcessGroup.addError(error);
                        }
                    }



                newProcessGroup.setSuccess(!newProcessGroup.hasFatalErrors());
                log.info("Finished importing template Errors found.  Success: {}, {} {}", newProcessGroup.isSuccess(),(errors != null ? errors.size() : 0), (errors != null ? " - " + StringUtils.join(errors) : ""));

                return newProcessGroup;

            }

        }
        return null;
    }
}