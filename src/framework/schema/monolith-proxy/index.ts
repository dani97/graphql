import assert from 'assert';
import { createMonolithExecutor } from './monolith-executor';
import { introspectSchema } from 'graphql-tools';
import { FrameworkConfig } from '../../config';
import { isInputObjectType } from 'graphql';
import { Logger } from '../../logger';

type Opts = {
    config: FrameworkConfig;
    logger: Logger;
};

/**
 * @summary Builds pieces needed for a remote schema
 *          that proxies requests back to the Magento
 *          PHP implementation of GraphQL. This is done
 *          to allow a gradual migration off the
 *          monolith GraphQL API.
 *
 *          As new storefront services are written,
 *          their implementations in PHP GraphQL will
 *          be deprecated, and this project will become
 *          the sole owner of the GraphQL schema for Magento
 *          eCommerce APIs.
 *
 *          Note that, at the time of writing, the recommended
 *          way to proxy a schema seems to be with Federation.
 *          Federation requires a 2-way contract: the proxied
 *          GraphQL API (our PHP app) needs to know how to be
 *          federated. Because this proxy is temporary and
 *          changes to Magento core are slow, we're using
 *          a remote schema + stitching for now.
 *
 *          We can and should revisit this decision if stitching
 *          becomes hard to maintain.
 */
export async function createMonolithProxySchema({ config, logger }: Opts) {
    const monolithURL = config.get('MONOLITH_GRAPHQL_URL').asString();
    const executor = createMonolithExecutor(monolithURL);
    let schema;

    try {
        logger.info(`Fetching monolith schema from ${monolithURL}`);
        schema = await introspectSchema(executor);
    } catch (err) {
        logger.error(
            `Failed introspecting monolith schema from ${monolithURL}`,
        );
        throw new Error(
            `Failed introspecting remote Magento schema at "${monolithURL}". ` +
                'Make sure that the MONOLITH_GRAPHQL_URL configuration is set to ' +
                'the correct value for your Magento instance',
        );
    }

    const attrFilterInput = schema.getType('ProductAttributeFilterInput');
    assert(
        isInputObjectType(attrFilterInput),
        'Could not find required type "ProductAttributeFilterInput" in PHP application schema. Make sure your Magento store is running version 2.3.4 or later.',
    );

    const attrFilterFields = attrFilterInput.getFields();
    // TODO: This check won't be necessary anymore when this PR lands and we update our delegation:
    // https://github.com/magento/magento2/pull/28316
    assert(
        Object.prototype.hasOwnProperty.call(attrFilterFields, 'sku'),
        'Could not find required field "ProductAttributeFilterInput.sku" in PHP application schema. Make sure your store has the "sku" attribute exposed for filtering: https://devdocs.magento.com/guides/v2.4/graphql/custom-filters.html',
    );

    return { schema, executor };
}
