import React from "react";
import {Link} from "components/Router";

export default ({categories}) => {
    return (<>
        <hr/>
        {categories && (
            <div className={"categories"}>
                {categories.map(tag => (
                    <Link className={"category"} key={tag.key} to={tag.path}>{`${tag.value}`}</Link>
                ))}
            </div>)}
        <hr/>
    </>);
}