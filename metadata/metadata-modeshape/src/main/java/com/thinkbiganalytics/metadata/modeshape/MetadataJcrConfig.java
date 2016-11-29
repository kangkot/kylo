/**
 * 
 */
package com.thinkbiganalytics.metadata.modeshape;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.thinkbiganalytics.metadata.api.PostMetadataConfigAction;
import com.thinkbiganalytics.metadata.api.category.CategoryProvider;
import com.thinkbiganalytics.metadata.api.datasource.DatasourceDefinitionProvider;
import com.thinkbiganalytics.metadata.api.datasource.DatasourceProvider;
import com.thinkbiganalytics.metadata.api.extension.ExtensibleEntityProvider;
import com.thinkbiganalytics.metadata.api.extension.ExtensibleTypeProvider;
import com.thinkbiganalytics.metadata.api.feed.FeedProvider;
import com.thinkbiganalytics.metadata.api.feedmgr.category.FeedManagerCategoryProvider;
import com.thinkbiganalytics.metadata.api.feedmgr.feed.FeedManagerFeedProvider;
import com.thinkbiganalytics.metadata.api.feedmgr.template.FeedManagerTemplateProvider;
import com.thinkbiganalytics.metadata.api.op.FeedOperationsProvider;
import com.thinkbiganalytics.metadata.api.sla.FeedServiceLevelAgreementProvider;
import com.thinkbiganalytics.metadata.api.user.UserProvider;
import com.thinkbiganalytics.metadata.modeshape.category.JcrCategoryProvider;
import com.thinkbiganalytics.metadata.modeshape.category.JcrFeedManagerCategoryProvider;
import com.thinkbiganalytics.metadata.modeshape.common.ModeShapeAvailability;
import com.thinkbiganalytics.metadata.modeshape.datasource.JcrDatasourceDefinitionProvider;
import com.thinkbiganalytics.metadata.modeshape.datasource.JcrDatasourceProvider;
import com.thinkbiganalytics.metadata.modeshape.extension.JcrExtensibleEntityProvider;
import com.thinkbiganalytics.metadata.modeshape.extension.JcrExtensibleTypeProvider;
import com.thinkbiganalytics.metadata.modeshape.feed.JcrFeedManagerFeedProvider;
import com.thinkbiganalytics.metadata.modeshape.feed.JcrFeedProvider;
import com.thinkbiganalytics.metadata.modeshape.op.JobRepoFeedOperationsProvider;
import com.thinkbiganalytics.metadata.modeshape.sla.JcrFeedServiceLevelAgreementProvider;
import com.thinkbiganalytics.metadata.modeshape.sla.JcrServiceLevelAgreementProvider;
import com.thinkbiganalytics.metadata.modeshape.tag.TagProvider;
import com.thinkbiganalytics.metadata.modeshape.template.JcrFeedTemplateProvider;
import com.thinkbiganalytics.metadata.modeshape.user.JcrUserProvider;

/**
 *
 * @author Sean Felten
 */
@Configuration
public class MetadataJcrConfig {
    
    @Bean
    public UserProvider userProvider() {
        // TODO consider moving this to its own configuration, and perhaps the whole user management 
        // to a separate module than the metadata one.
        return new JcrUserProvider();
    }
    
    @Bean
    public ExtensibleTypeProvider extensibleTypeProvider() {
        return new JcrExtensibleTypeProvider();
    }
    
    @Bean
    public ExtensibleEntityProvider extensibleEntityProvider() {
        return new JcrExtensibleEntityProvider();
    }

    @Bean
    public CategoryProvider categoryProvider() {
        return new JcrCategoryProvider();
    }

    @Bean
    public FeedProvider feedProvider() {
        return new JcrFeedProvider();
    }
    
    @Bean
    public FeedOperationsProvider feedOperationsProvider() {
        return new JobRepoFeedOperationsProvider();
    }

    @Bean
    public TagProvider tagProvider() {
        return new TagProvider();
    }

    @Bean
    public DatasourceProvider datasourceProvider() {
        return new JcrDatasourceProvider();
    }

    @Bean
    public FeedManagerCategoryProvider feedManagerCategoryProvider() {
        return new JcrFeedManagerCategoryProvider();
    }

    @Bean
    public FeedManagerFeedProvider feedManagerFeedProvider(){
        return new JcrFeedManagerFeedProvider();
    }

    @Bean
    public FeedManagerTemplateProvider feedManagerTemplateProvider(){
        return new JcrFeedTemplateProvider();
    }

    @Bean
    public DatasourceDefinitionProvider datasourceDefinitionProvider() {
        return new JcrDatasourceDefinitionProvider();
    }


//    @Bean
//    public FeedProvider feedProvider() {
//        return new InMemoryFeedProvider();
//    }
//
//    @Bean
//    public DatasourceProvider datasetProvider() {
//        return new InMemoryDatasourceProvider();
//    }

    @Bean
    public JcrServiceLevelAgreementProvider slaProvider() {
        return new JcrServiceLevelAgreementProvider();
    }

    @Bean
    public FeedServiceLevelAgreementProvider jcrFeedSlaProvider(){
        return new JcrFeedServiceLevelAgreementProvider();
    }



    @Bean
    public ModeShapeAvailability modeShapeAvailability(){
        return new ModeShapeAvailability();
    }



    @Bean
    public JcrMetadataAccess metadataAccess() {
        return new JcrMetadataAccess();
    }
    
    @Bean(initMethod="configure")
    public MetadataJcrConfigurator jcrConfigurator(List<PostMetadataConfigAction> postConfigActions) {
        return new MetadataJcrConfigurator(postConfigActions);
    }

    /**
     * Guarantees that at least one action exists, otherwise the list injection above will fail.
     */
    @Bean
    protected PostMetadataConfigAction dummyAction() {
        return new PostMetadataConfigAction() {
            @Override
            public void run() {
                // Do nothing.
            }
        };
    }
}
