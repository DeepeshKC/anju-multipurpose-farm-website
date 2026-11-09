import {reply,isAdmin} from '../../_shared.js';
export async function onRequestGet({request,env}){return reply({authenticated:await isAdmin(request,env)})}
