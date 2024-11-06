// we need to prepare the data for the conversion
// main issue is that the order of children in the xml is important
// the xml2js library allows preserving the order, but the output needs parsing
// to be useable for us.

/*
    We can convert the data as follows:
    - iterate over the children of the root element:
        - if the child is a text node, it becomes a property of the parent

I think it is easier to put something "on top". A class that we feed the data and then we can access the data in a more structured way.

*/


export class XmlWrapper {
    constructor(data, parent = null) {
        this.data = data;
        this.parent = parent;
    }

    /**
     * Returns the children of the current node
     * @returns {Array<XmlWrapper>} the children of the current node
     */
    get children() {
        if (!this.hasChildren) {
            return null;
        }
        return this.data.$$.map(child => new XmlWrapper(child, this));
    }

    /**
     * Returns the attributes of the current node
     * @returns {Object} the attributes of the current node
     */
    get attributes() {
        if (!this.hasAttributes) {
            return null;
        }
        return this.data.$;
    }

    /**
     * Returns the text of the current node
     * @returns {string} the text of the current node
     */
    get text() {
        if (!this.isText) {
            return null;
        }
        return this.data._;
    }

    /**
     * Returns the name of the current node
     * @returns {string} the name of the current node
     */
    get name() {
        return this.data['#name'];
    }

    /**
     * Returns whether the current node is a text node
     * @returns {boolean} whether the current node is a text node
     */
    get isText () {
        return this.data._ !== undefined;
    }

    /**
     * Returns whether the current node has children
     * @returns {boolean} whether the current node has children
     */
    get hasChildren() {
        return this.data.$$ !== undefined;
    }

    /**
     * Returns whether the current node has attributes
     * @returns {boolean} whether the current node has attributes
     */
    get hasAttributes() {
        return this.data.$ !== undefined
    }

    /**
     * Returns the children and attributes with the given name. Only use this if you are not 
     * interested in the order of different types of children within this node.
     * @param {string} name the name of the child to return
     * @param {boolean} forceChild if true, don't reduce single children
     * @returns {Array<XmlWrapper>} the children with the given name
     * @returns {XmlWrapper} the child with the given name
     * @returns {null} if no child with the given name exists
     */
    get (name, forceChild = false) {
        let ret = [];
        if (this.hasAttributes && this.attributes[name] !== undefined) {
            ret.push(this.attributes[name]);
        }
        if (this.hasChildren) {
            this.children.filter(child => child.name === name).forEach(child => {
                ret.push(child);
            });
        }
        if (ret.length === 1) {
            // if there is only one element, return it directly
            // if the element is a text node, return the text like an attribute
            if (!forceChild) {
                if (ret[0].isText) {
                    return ret[0].text;
                }
            }
            return ret[0];
        }
        if (ret.length === 0) {
            return null;
        }
        return ret;
    }

    /**
     * Returns a dictionary with the keys being the names of the children and the values being the children
     * @returns {Object} a dictionary with the keys being the names of the children and the values being the children
     */
    get keys () {
        const ret = Object.assign({}, this.attributes);
        this.children.forEach(child => {
            if (ret[child.name] !== undefined) {
                if (!Array.isArray(ret[child.name])) {
                    ret[child.name] = [ret[child.name]];
                }
                ret[child.name].push(child);
            }
            ret[child.name] = child;
        });
        return ret;
    }
}


