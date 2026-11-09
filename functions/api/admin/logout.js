import {reply,clearCookie,sameOrigin} from '../../_shared.js';
export function onRequestPost({request}){return sameOrigin(request)?reply({ok:true},200,{'set-cookie':clearCookie}):reply({error:'Invalid origin'},403)}
