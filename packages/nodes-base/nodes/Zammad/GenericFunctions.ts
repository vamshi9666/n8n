import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	ILoadOptionsFunctions,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

import {
	OptionsWithUri,
} from 'request';

import {
	flow,
} from 'lodash';

import type { Zammad } from './types';

export async function zammadApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: string,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
) {
	const options: OptionsWithUri = {
		method,
		body,
		qs,
		uri: '',
		json: true,
	};

	const credentials = await this.getCredentials('zammadApi') as Zammad.Credentials;

	if (credentials.authType === 'basicAuth') {

		const baseUrl = tolerateTrailingSlash(credentials.baseUrl);

		options.auth = {
			user: credentials.username,
			pass: credentials.password,
		};

		options.uri = `${baseUrl}/api/v1${endpoint}`;
		options.rejectUnauthorized = !credentials.allowUnauthorizedCerts;

	} else if (credentials.authType === 'tokenAuth') {

		const baseUrl = tolerateTrailingSlash(credentials.baseUrl);

		options.headers = {
			Authorization: `Token token=${credentials.accessToken}`,
		};

		options.uri = `${baseUrl}/api/v1${endpoint}`;
		options.rejectUnauthorized = !credentials.allowUnauthorizedCerts;

	}

	if (!Object.keys(body).length) {
		delete options.body;
	}

	if (!Object.keys(qs).length) {
		delete options.qs;
	}

	try {
		return await this.helpers.request!(options);
	} catch (error) {
		if (error.error.error === 'Object already exists!') {
			error.error.error = 'An entity with this name already exists.';
		}

		throw new NodeApiError(this.getNode(), error);
	}
}

export async function zammadApiRequestAllItems(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: string,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	limit = 0,
) {
	// https://docs.zammad.org/en/latest/api/intro.html#pagination

	const returnData: IDataObject[] = [];

	let responseData;
	qs.per_page = 20;
	qs.page = 1;

	do {
		responseData = await zammadApiRequest.call(this, method, endpoint, body, qs);
		returnData.push(...responseData);

		if (limit && returnData.length > limit) {
			return returnData.slice(0, limit);
		}

		qs.page++;
	} while (responseData.length);

	return returnData;
}

export function tolerateTrailingSlash(url: string) {
	return url.endsWith('/')
		? url.substr(0, url.length - 1)
		: url;
}

export function throwOnEmptyUpdate(this: IExecuteFunctions, resource: string) {
	throw new NodeOperationError(
		this.getNode(),
		`Please enter at least one field to update for the ${resource}`,
	);
}

// ----------------------------------
//        loadOptions utils
// ----------------------------------

export const fieldToLoadOption = (i: Zammad.Field) => {
	return { name: prettifyDisplayName(i.display), value: i.name };
};

export const prettifyDisplayName = (fieldName: string) => fieldName.replace('name', ' Name');

export const isCustomer = (user: Zammad.User) =>
	user.role_ids.includes(3) && !user.email.endsWith('@zammad.org');

export async function getAllFields(this: ILoadOptionsFunctions) {
	return await zammadApiRequest.call(this, 'GET', '/object_manager_attributes') as Zammad.Field[];
}

const isTypeField = (resource: 'Group' | 'Organization' | 'Ticket' | 'User') =>
	(arr: Zammad.Field[]) => arr.filter(i => i.object === resource);

export const getGroupFields = isTypeField('Group');
export const getOrganizationFields = isTypeField('Organization');
export const getUserFields = isTypeField('User');
export const getTicketFields = isTypeField('Ticket');

const getCustomFields = (arr: Zammad.Field[]) => arr.filter(i => i.created_by_id !== 1);

export const getGroupCustomFields = flow(getGroupFields, getCustomFields);
export const getOrganizationCustomFields = flow(getOrganizationFields, getCustomFields);
export const getUserCustomFields = flow(getUserFields, getCustomFields);
export const getTicketCustomFields = flow(getTicketFields, getCustomFields);

export const isRelevantOrg = (i: Zammad.Organization) => i.name !== 'Zammad Foundation' && i.active;
export const isRelevantGroup = (i: Zammad.Organization) => i.active;
