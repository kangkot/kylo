/**
 * The result of a Spark transformation.
 *
 * @typedef {Object} TransformResponse
 * @property {string} message the error message if status is "error"
 * @property {QueryResult} results the results if status is "success"
 * @property {string} status "success" if the script executed successfully or "error" if an exception occurred
 * @property {string} table the Hive table containing the results if status is "success"
 */

/**
 * The result of a SQL query or Spark DataFrame.
 *
 * @typedef {Object} QueryResult
 * @property {Object.<String, QueryResultColumn>} columnDisplayNameMap maps column display names to column details
 * @property {Object.<String, QueryResultColumn>} columnFieldMap maps field names to column details
 * @property {Array.<QueryResultColumn>} columns list of column details
 * @property {string} query the Spark script that was sent in the request
 * @property {Array.<Object.<String, *>>} rows maps field names to values
 */

/**
 * A column in a QueryResult.
 *
 * @typedef {Object} QueryResultColumn
 * @property {string} databaseName name of the database containing the table
 * @property {string} dataType name of the data type for the column
 * @property {string} displayName a human-readable name for the column
 * @property {string} field name of the column in the table
 * @property {string} hiveColumnLabel suggested title for the column, usually specified by the AS clause
 * @property {number} index position of the column in the table
 * @property {string} tableName name of the source table
 */

/**
 * A field in a database table.
 *
 * @typedef {Object} SchemaField
 * @property {string} dataType name of the data type
 * @property {string} description a description for the field contents
 * @property {string} name field name
 * @property {boolean} nullable {@code true} if the field can contain {@code null} values
 * @property {boolean} primaryKey {@code true} if the field is a part of the primary key
 * @property {string[]} sampleValues sample values of the field
 */

/**
 * Maintains the state of a Spark script for a single transformation.
 *
 * @typedef {Object} ScriptState
 * @property {Array.<QueryResultColumn>|null} columns the columns as returned by the server
 * @property {string} icon the icon for the transformation
 * @property {string} name the name of the transformation
 * @property {Array.<Object.<string,*>>|null} rows the rows as returned by the server
 * @property {string} script the Spark script
 * @property {string|null} table the table containing the results
 */

angular.module(MODULE_FEED_MGR).factory("SparkShellService", function($http, $mdDialog, RestUrlService) {
    // URL to the API server
    var API_URL = RestUrlService.SPARK_SHELL_SERVICE_URL;

    /** TernJS directive for defined types */
    var DEFINE_DIRECTIVE = "!define";

    /** Regular expression for conversion strings */
    var FORMAT_REGEX = /%([cCdfs])/g;

    /** TernJS directive for the Spark code */
    var SPARK_DIRECTIVE = "!spark";

    /** Return type for columns in TernJS */
    var TERNJS_COLUMN_TYPE = "Column";

    /** TernJS directive for the return type */
    var TYPE_DIRECTIVE = "!sparkType";

    /**
     * Constructs a SparkShellService.
     *
     * @constructor
     * @param sql the source SQL for transformations
     */
    var SparkShellService = function(sql) {
        /**
         * Transformation function definitions.
         *
         * @private
         * @type {Object}
         */
        this.defs_ = {};

        /**
         * Number of rows to select in the initial query.
         *
         * @private
         * @type {number}
         */
        this.limit_ = 1000;

        /**
         * Indicates if limiting should be done before sampling.
         *
         * @private
         * @type {boolean}
         */
        this.limitBeforeSample_ = false;

        /**
         * List of states that can be redone.
         *
         * @private
         * @type {Array.<ScriptState>}
         */
        this.redo_ = [];

        /**
         * Fraction of rows to include when sampling.
         *
         * @private
         * @type {number}
         */
        this.sample_ = 1.0;

        /**
         * The source SQL for transformations.
         *
         * @private
         * @type {string}
         */
        this.source_ = sql;

        /**
         * List of states.
         * 
         * @private
         * @type {Array.<ScriptState>}
         */
        this.states_ = [this.newState()];
    };

    angular.extend(SparkShellService.prototype, {
        /**
         * Indicates if a previously undone transformation can be redone.
         *
         * @returns {boolean} {@code true} if the transformation can be restored
         */
        canRedo: function() {
            return (this.redo_.length != 0);
        },

        /**
         * Indicates if the current transformation can be undone.
         *
         * @returns {boolean} {@code true} if the current transformation can be undone
         */
        canUndo: function() {
            return (this.states_.length > 1);
        },

        /**
         * Gets the type definitions for the output columns of the current script. These definitions are only available after
         * receiving a {@link SparkShellService#transform} response.
         *
         * @returns {Object} the column type definitions
         */
        getColumnDefs: function() {
            // Set directives
            var defs = {
                "!name": "columns"
            };

            defs[DEFINE_DIRECTIVE] = {};
            defs[DEFINE_DIRECTIVE][TERNJS_COLUMN_TYPE] = {};

            // Add column names
            var columns = this.getState().columns;

            if (columns !== null) {
                angular.forEach(columns, function(column) {
                    defs[column.field] = TERNJS_COLUMN_TYPE;
                });
            }

            return defs;
        },

        /**
         * Gets the Hive column label for the field with the specified name.
         *
         * @param {string} fieldName the field name
         * @returns {string|null} the Hive column label if the column exists, or {@code null} otherwise
         */
        getColumnLabel: function(fieldName) {
            for (var i=this.states_.length-1; i >= 0; --i) {
                var columns = this.states_[i].columns;
                if (columns !== null) {
                    for (var j = 0; j < columns.length; ++j) {
                        if (columns[j].field === fieldName) {
                            return columns[j].hiveColumnLabel;
                        }
                    }
                }
            }
            return null;
        },

        /**
         * Gets the columns after applying the current transformation.
         * 
         * @returns {Array.<QueryResultColumn>|null} the columns or {@code null} if the transformation has not been applied
         */
        getColumns: function() {
            return this.getState().columns;
        },

        /**
         * Gets the schema fields for the the current transformation. The transformation must have been applied first.
         *
         * @returns {Array.<SchemaField>} the schema fields
         */
        getFields: function() {
            return _.map(this.getColumns(), function(col) {
                var dataType;
                if (col.dataType.startsWith("decimal")) {
                    dataType = "double";
                } else if (col.dataType === "smallint") {
                    dataType = "int";
                } else {
                    dataType = col.dataType;
                }
                return {name: col.hiveColumnLabel, description: "", dataType: dataType, primaryKey: false, nullable: false,
                    sampleValues: []};
            });
        },

        /**
         * Gets the function definitions being used.
         *
         * @return {Object} the function definitions
         */
        getFunctionDefs: function() {
            return this.defs_;
        },

        /**
         * Gets the rows after applying the current transformation.
         * 
         * @returns {Array.<Object.<string,*>>|null} the rows or {@code null} if the transformation has not been applied
         */
        getRows: function() {
            return this.getState().rows;
        },

        /**
         * Gets the Spark script.
         *
         * @param {number} [opt_start] the index of the first transformation
         * @param {number} [opt_end] the index of the last transformation
         * @returns {string} the Spark script
         */
        getScript: function(opt_start, opt_end) {
            // Determine start and end indexes
            var start = (typeof(opt_start) !== "undefined") ? opt_start : 0;
            var end = (typeof(opt_end) !== "undefined") ? opt_end + 1 : this.states_.length;

            // Build script
            var sparkScript = "import org.apache.spark.sql._\n";

            if (start === 0) {
                sparkScript += "sqlContext.sql(\"" + this.source_ + "\")";
                if (this.limitBeforeSample_ && this.limit_ > 0) {
                    sparkScript += ".limit(" + this.limit_ + ")";
                }
                if (this.sample_ > 0 && this.sample_ < 1) {
                    sparkScript += ".sample(false, " + this.sample_ + ")";
                }
                if (!this.limitBeforeSample_ && this.limit_ > 0) {
                    sparkScript += ".limit(" + this.limit_ + ")";
                }
            } else {
                sparkScript += "parent";
            }

            for (var i = start; i < end; ++i) {
                sparkScript += this.states_[i].script;
            }

            return sparkScript;
        },

        /**
         * The number of rows to select in the initial query.
         *
         * @param {number} [opt_value] the new value
         * @returns {number} the number of rows
         */
        limit: function(opt_value) {
            if (arguments.length !== 0) {
                this.clearTableState();
                this.limit_ = opt_value;
            }
            return this.limit_;
        },

        /**
         * Removes the last transformation from the stack. This action cannot be undone.
         *
         * @see #undo()
         */
        pop: function() {
            if (this.states_.length > 1) {
                this.states_.pop();
            }
        },

        /**
         * Adds a transformation expression to the stack.
         *
         * @param {string} name the name of the transformation
         * @param {string} icon the icon for the transformation
         * @param {acorn.Node} tree the abstract syntax tree for the expression
         */
        push: function(name, icon, tree) {
            // Add new state
            var state = this.newState();
            state.name = name;
            state.icon = icon;
            state.script = toScript(tree, this);
            this.states_.push(state);

            // Clear redo states
            this.redo_ = [];
        },

        /**
         * Restores the last transformation that was undone.
         *
         * @see #undo()
         * @returns {{icon: string, name: string}} the name and icon for the transformation
         * @throws {Error} if there are no transformations to redo
         */
        redo: function() {
            if (this.redo_.length > 0) {
                var state = this.redo_.pop();
                this.states_.push(state);
                return {icon: state.icon, name: state.name};
            }
            else {
                throw new Error("No states to redo");
            }
        },

        /**
         * The fraction of rows to include when sampling.
         *
         * @param {number} [opt_value] the new value
         * @returns {number} the fraction of rows
         */
        sample: function(opt_value) {
            if (arguments.length !== 0) {
                this.clearTableState();
                this.sample_ = opt_value;
            }
            return this.sample_;
        },

        /**
         * Sets the function definitions to use.
         *
         * @param {Object} defs the function definitions
         */
        setFunctionDefs: function(defs) {
            this.defs_ = defs;
        },

        /**
         * Indicates if the limiting should be done before sampling.
         *
         * @param {boolean} [opt_value] the new value
         * @returns {boolean} {@code true} if limiting should be done first, or {@code false} if sampling should be done first
         */
        shouldLimitBeforeSample: function(opt_value) {
            if (arguments.length !== 0) {
                this.clearTableState();
                this.limitBeforeSample_ = opt_value;
            }
            return this.limitBeforeSample_;
        },

        /**
         * Removes transformations from the current script.
         *
         * @param {number} start
         * @param {number} deleteCount
         */
        splice: function(start, deleteCount) {
            // Delete states
            this.states_.splice(start, deleteCount);
            this.clearTableState(start);

            // Clear redo states
            this.redo_ = [];
        },

        /**
         * Runs the current Spark script on the server.
         *
         * @return {HttpPromise} a promise for the response
         */
        transform: function() {
            // Build the request body
            var body = {sendResults: true};
            var index = this.states_.length - 1;

            if (index > 0) {
                // Find last cached state
                var last = index - 1;
                while (last >= 0 && this.states_[last].table === null) {
                    --last;
                }

                // Add script to body
                body["script"] = this.getScript(last + 1, index);
                if (last >= 0) {
                    body["parent"] = {
                        table: this.states_[last].table,
                        script: this.getScript(0, last)
                    };
                }
            }
            else {
                body["script"] = this.getScript()
            }

            // Create the response handlers
            var self = this;
            var successCallback = function(response) {
                var state = self.states_[index];
                state.columns = response.data.results.columns;
                state.rows = response.data.results.rows;
                state.table = response.data.table;
            };
            var errorCallback = function(response) {
                var alert = $mdDialog.alert()
                        .parent($('body'))
                        .clickOutsideToClose(true)
                        .title("Error executing the query")
                        .textContent(response.data.message)
                        .ariaLabel("error executing the query")
                        .ok("Got it!");
                $mdDialog.show(alert);
            };

            // Send the request
            var promise = $http({
                method: "POST",
                url: API_URL + "/transform",
                data: JSON.stringify(body),
                headers: {"Content-Type": "application/json"},
                responseType: "json"
            });
            promise.then(successCallback, errorCallback);
            return promise;
        },

        /**
         * Reverts to the previous transformation. The current transformation is remembered and may be restored.
         *
         * @see #pop()
         * @see #redo()
         * @returns {{icon: string, name: string}} the name and icon for the transformation
         * @throws {Error} if there are no transformations to undo
         */
        undo: function() {
            if (this.states_.length > 1) {
                var state = this.states_.pop();
                this.redo_.push(state);
                return {icon: state.icon, name: state.name};
            }
            else {
                throw new Error("No states to undo");
            }
        },

        /**
         * Clears table data from all states. This doesn't affect column information that doesn't change with the limit or sample
         * properties.
         */
        clearTableState: function(opt_index) {
            var index = (typeof(opt_index) !== "undefined") ? opt_index : 0;

            for (var r=index; r < this.redo_.length; ++r) {
                this.redo_[r].rows = null;
                this.redo_[r].table = null;
            }
            for (var s=index; s < this.states_.length; ++s) {
                this.states_[s].rows = null;
                this.states_[s].table = null;
            }
        },

        /**
         * Gets the current state.
         *
         * @private
         * @returns {ScriptState} the current state
         */
        getState: function() {
            return this.states_.length > 0 ? this.states_[this.states_.length - 1] : {};
        },

        /**
         * Creates a new script state.
         *
         * @private
         * @returns {ScriptState} a new script state
         */
        newState: function() {
            return {columns: null, icon: "code", name: "", rows: null, script: "", table: null};
        }
    });

    /**
     * Types supported by SparkExpression.
     *
     * @readonly
     * @enum {string}
     */
    var SparkType = {
        /** Represents a Spark SQL Column */
        COLUMN: "column",

        /** Represents a Spark SQL DataFrame */
        DATA_FRAME: "dataframe",

        /** Represents a Spark SQL GroupedData */
        GROUPED_DATA: "groupeddata",

        /** Represents a Scala number or string literal */
        LITERAL: "literal",

        /**
         * Gets the TernJS definition name for the specified type.
         *
         * @param {SparkType} sparkType the Spark type
         * @returns {string|null}
         */
        toTernjsName: function(sparkType) {
            switch (sparkType) {
                case SparkType.COLUMN:
                    return TERNJS_COLUMN_TYPE;

                case SparkType.GROUPED_DATA:
                    return "GroupedData";

                default:
                    return null;
            }
        }
    };

    /**
     * Thrown to indicate that the abstract syntax tree could not be parsed.
     *
     * @constructor
     * @param {string} message the error message
     * @param {number} [opt_col] the column number
     */
    function ParseException(message, opt_col) {
        this.name = "ParseException";
        this.message = message + (opt_col ? " at column number " + opt_col : "");
    }

    ParseException.prototype = Object.create(Error.prototype);

    /**
     * An expression in a Spark script.
     *
     * @constructor
     * @param {string} source the Spark code
     * @param {SparkType} type the result type
     * @param {number} start the first column in the original expression
     * @param {number} end the last column in the original expression
     */
    function SparkExpression(source, type, start, end) {
        /**
         * Spark source code.
         * @type {string}
         */
        this.source = source;

        /**
         * Result type.
         * @type {SparkType}
         */
        this.type = type;

        /**
         * Column of the first character in the original expression.
         * @type {number}
         */
        this.start = start;

        /**
         * Column of the last character in the original expression.
         * @type {number}
         */
        this.end = end;
    }

    angular.extend(SparkExpression, {
        /**
         * Context for formatting a Spark conversion string.
         *
         * @typedef {Object} FormatContext
         * @property {SparkExpression[]} args the format parameters
         * @property {number} index the current position within {@code args}
         */

        /**
         * Formats the specified string by replacing the type specifiers with the specified parameters.
         *
         * @static
         * @param {string} str the Spark conversion string to be formatted
         * @param {...SparkExpression} var_args the format parameters
         * @returns {string} the formatted string
         * @throws {Error} if the conversion string is not valid
         * @throws {ParseException} if a format parameter cannot be converted to the specified type
         */
        format: function(str, var_args) {
            var context = {
                args: Array.prototype.slice.call(arguments, 1),
                index: 0
            };
            return str.replace(FORMAT_REGEX, angular.bind(str, SparkExpression.replace, context));
        },

        /**
         * Creates a Spark expression from a function definition.
         *
         * @static
         * @param {Object} definition the function definition
         * @param {acorn.Node} node the source abstract syntax tree
         * @param {...SparkExpression} var_args the format parameters
         * @returns {SparkExpression} the Spark expression
         * @throws {Error} if the function definition is not valid
         * @throws {ParseException} if a format parameter cannot be converted to the required type
         */
        fromDefinition: function(definition, node, var_args) {
            // Convert Spark string to code
            var args = [definition[SPARK_DIRECTIVE]];
            Array.prototype.push.apply(args, Array.prototype.slice.call(arguments, 2));

            var source = SparkExpression.format.apply(SparkExpression, args);

            // Return expression
            return new SparkExpression(source, definition[TYPE_DIRECTIVE], node.start, node.end);
        },

        /**
         * Converts the next argument to the specified type for a Spark conversion string.
         *
         * @private
         * @static
         * @param {FormatContext} context the format context
         * @param {string} match the conversion specification
         * @param {string} type the type specifier
         * @returns {string} the converted Spark code
         * @throws {Error} if the type specifier is not supported
         * @throws {ParseException} if the format parameter cannot be converted to the specified type
         */
        replace: function(context, match, type) {
            // Validate arguments
            if (context.args.length <= context.index) {
                throw new ParseException("Not enough arguments for conversion");
            }

            // Convert to requested type
            switch (type) {
                case "c":
                    return SparkExpression.toColumn(context.args[context.index++]);

                case "C":
                    return SparkExpression.toColumnArgs(context);

                case "s":
                    return SparkExpression.toString(context.args[context.index++]);

                default:
                    throw new Error("Not a recognized type specifier: " + match);
            }
        },

        /**
         * Converts the specified Spark expression to a Column type.
         *
         * @private
         * @static
         * @param {SparkExpression} expression the Spark expression
         * @returns {string} the Spark code for the new type
         * @throws {ParseException} if the expression cannot be converted to a column
         */
        toColumn: function(expression) {
            switch (expression.type) {
                case SparkType.COLUMN:
                    return expression.source;

                case SparkType.LITERAL:
                    return "functions.lit(" + expression.source + ")";

                default:
                    throw new ParseException("Expression cannot be converted to a column: " + expression.type, expression.start);
            }
        },

        /**
         * Converts the specified Spark expressions to a list of function arguments.
         *
         * @param {FormatContext} context the format context
         * @returns {string} the Spark code for the function arguments
         * @throws {ParseException} if any expression cannot be converted to a column
         */
        toColumnArgs: function(context) {
            var result = "";

            for (; context.index < context.args.length; ++context.index) {
                if (context.index !== 0) {
                    result += ", ";
                }
                result += SparkExpression.toColumn(context.args[context.index]);
            }

            return result;
        },

        /**
         * Converts the specified Spark expression to a string literal.
         *
         * @private
         * @static
         * @param {SparkExpression} expression the Spark expression
         * @returns {string} the Spark code for the string literal
         * @throws {ParseException} if the expression cannot be converted to a string
         */
        toString: function(expression) {
            if (SparkType.LITERAL) {
                return (expression.source.charAt(0) === "\"") ? expression.source : "\"" + expression.source + "\"";
            } else {
                throw new ParseException("Expression cannot be converted to a string: " + expression.type, expression.start);
            }
        }
    });

    /**
     * Converts a binary expression node to a Spark expression.
     *
     * @param {acorn.Node} node the binary expression node
     * @param {SparkShellService} sparkShellService the Spark shell service
     * @returns {SparkExpression} the Spark expression
     * @throws {Error} if the function definition is not valid
     * @throws {ParseException} if a function argument cannot be converted to the required type
     */
    function parseBinaryExpression(node, sparkShellService) {
        // Get the function definition
        var def = null;

        switch (node.operator) {
            case "+":
                def = sparkShellService.getFunctionDefs().add;
                break;

            case "-":
                def = sparkShellService.getFunctionDefs().subtract;
                break;

            case "*":
                def = sparkShellService.getFunctionDefs().multiply;
                break;

            case "/":
                def = sparkShellService.getFunctionDefs().divide;
                break;

            case "==":
                def = sparkShellService.getFunctionDefs().equal;
                break;

            case "!=":
                def = sparkShellService.getFunctionDefs().notEqual;
                break;

            case ">":
                def = sparkShellService.getFunctionDefs().greaterThan;
                break;

            case ">=":
                def = sparkShellService.getFunctionDefs().greaterThanOrEqual;
                break;

            case "<":
                def = sparkShellService.getFunctionDefs().lessThan;
                break;

            case "<=":
                def = sparkShellService.getFunctionDefs().lessThanOrEqual;
                break;

            default:
        }

        if (def == null) {
            throw new ParseException("Binary operator not supported: " + node.operator, node.start);
        }

        // Convert to a Spark expression
        var left = toSpark(node.left, sparkShellService);
        var right = toSpark(node.right, sparkShellService);
        return SparkExpression.fromDefinition(def, node, left, right);
    }

    /**
     * Converts a call expression node to a Spark expression.
     *
     * @param {acorn.Node} node the call expression node
     * @param {SparkShellService} sparkShellService the Spark shell service
     * @returns {SparkExpression} the Spark expression
     * @throws {Error} if the function definition is not valid
     * @throws {ParseException} if a function argument cannot be converted to the required type
     */
    function parseCallExpression(node, sparkShellService) {
        // Get the function definition
        var def;
        var name;
        var parent = null;

        switch (node.callee.type) {
            case "Identifier":
                def = sparkShellService.getFunctionDefs()[node.callee.name];
                name = node.callee.name;
                break;

            case "MemberExpression":
                parent = toSpark(node.callee.object, sparkShellService);

                // Find function definition
                var ternjsName = SparkType.toTernjsName(parent.type);

                if (ternjsName !== null) {
                    def = sparkShellService.getFunctionDefs()[DEFINE_DIRECTIVE][ternjsName][node.callee.property.name];
                } else {
                    throw new ParseException("Result type has no members: " + parent.type);
                }
                break;

            default:
                throw new ParseException("Function call type not supported: " + node.callee.type);
        }

        if (def == null) {
            throw new ParseException("Function is not defined: " + name);
        }

        // Convert to a Spark expression
        var args = [def, node];

        angular.forEach(node.arguments, function(arg) {
            args.push(toSpark(arg, sparkShellService));
        });

        var spark = SparkExpression.fromDefinition.apply(SparkExpression, args);
        return (parent !== null) ? new SparkExpression(parent.source + spark.source, spark.type, spark.start, spark.end) : spark;
    }

    /**
     * TODO
     *
     * @param {acorn.Node} node the logical expression node
     * @param {SparkShellService} sparkShellService the Spark shell service
     * @returns {SparkExpression} the Spark expression
     * @throws {Error} if the function definition is not valid
     * @throws {ParseException} if a function argument cannot be converted to the required type
     */
    function parseLogicalExpression(node, sparkShellService) {
        // Get the function definition
        var def = null;

        switch (node.operator) {
            case "&&":
                def = sparkShellService.getFunctionDefs().and;
                break;

            case "||":
                def = sparkShellService.getFunctionDefs().or;
                break;

            default:
        }

        if (def == null) {
            throw new ParseException("Logical operator not supported: " + node.operator, node.start);
        }

        // Convert to a Spark expression
        var left = toSpark(node.left, sparkShellService);
        var right = toSpark(node.right, sparkShellService);
        return SparkExpression.fromDefinition(def, node, left, right);
    }

    /**
     * Converts the specified abstract syntax tree to a Scala expression for a Spark script.
     *
     * @param {acorn.Node} program the program node
     * @param {SparkShellService} sparkShellService the spark shell service
     * @returns {string} the Scala expression
     * @throws {Error} if a function definition is not valid
     * @throws {ParseException} if the program is not valid
     */
    function toScript(program, sparkShellService) {
        // Check node parameters
        if (program.type !== "Program") {
            throw new Error("Cannot convert non-program to Spark");
        }
        if (program.body.length !== 1) {
            throw new Error("Program is too long");
        }

        // Convert to a DataFrame
        var spark = toSpark(program.body[0], sparkShellService);

        switch (spark.type) {
            case SparkType.COLUMN:
                return ".select(new Column(\"*\"), " + spark.source + ")";

            case SparkType.DATA_FRAME:
                return spark.source;

            case SparkType.LITERAL:
                var column = SparkExpression.format("%c", spark);
                return ".select(new Column(\"*\"), " + column + ")";

            default:
                throw new Error("Result type not supported: " + spark.type);
        }
    }

    /**
     * Converts the specified abstract syntax tree to a Spark expression object.
     *
     * @param {acorn.Node} node the abstract syntax tree
     * @param {SparkShellService} sparkShellService the spark shell service
     * @returns {SparkExpression} the Spark expression
     * @throws {Error} if a function definition is not valid
     * @throws {ParseException} if the node is not valid
     */
    function toSpark(node, sparkShellService) {
        switch (node.type) {
            case "BinaryExpression":
                return parseBinaryExpression(node, sparkShellService);

            case "CallExpression":
                return parseCallExpression(node, sparkShellService);

            case "ExpressionStatement":
                return toSpark(node.expression, sparkShellService);

            case "Identifier":
                var label = StringUtils.quote(sparkShellService.getColumnLabel(node.name));
                return new SparkExpression("new Column(\"" + label + "\")", SparkType.COLUMN, node.start, node.end);

            case "Literal":
                return new SparkExpression(node.raw, SparkType.LITERAL, node.start, node.end);

            case "LogicalExpression":
                return parseLogicalExpression(node, sparkShellService);

            default:
                throw new Error("Unsupported node type: " + node.type);
        }
    }

    return SparkShellService;
});
