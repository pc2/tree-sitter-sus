
// Makes a list of "item" fields
function sepSeq1(rule, sepChar) {
    const itemRule = field("item", rule);
    return seq(itemRule, repeat(seq(sepChar, itemRule)))
}

// Makes a list of "item" fields
function sepSeq(rule, sepChar) {
    return optional(sepSeq1(rule, sepChar))
}

// Makes a list of "item" fields
function newlineSepSeq($, rule) {
    return seq(
        optional($._linebreak),
        optional(seq(
            field('item', rule),
            repeat(seq(
                $._linebreak,
                field('item', rule)
            )),
            optional($._linebreak)
        ))
    )
}

const PREC = {
    compare : 2,
    and: 3,
    or: 4,
    xor: 5,
    additive: 6,
    multiplicative: 7,
    unary: 8,
    postscript_op : 9,
    namespace_path : 10
}

module.exports = grammar({
    name: 'sus',

    rules: {
        // Top level structure

        source_file: $ => newlineSepSeq($, $.module),

        module: $ => seq(
            'module',
            field('name', $.identifier),
            optional(field('template_declaration_arguments', $.template_declaration_arguments)),
            optional(field('interface_ports', $.interface_ports)),
            field('block', $.block)
        ),
        
        interface_ports: $ => seq(
            ':',
            optional($._linebreak),
            choice(
                seq(
                    field('inputs', $.declaration_list),
                    optional($._interface_ports_output)
                ),
                $._interface_ports_output
            ),
        ),
        _interface_ports_output: $ => seq(
            '->',
            optional($._linebreak),
            field('outputs', $.declaration_list)
        ),

        // Template Declaration

        template_declaration_arguments: $ => seq(
            '<',
            sepSeq($.template_declaration_type, $._comma),
            '>'
        ),

        template_declaration_type: $ => seq(
            $.identifier // The template type name
        ),

        // Statements

        block: $ => seq(
            '{',
            newlineSepSeq($, choice(
                $.block,
                $.decl_assign_statement,
    
                // Decls should only allow a single declaration, and cannot contain expressions, 
                // but we allow some tolerance in the grammar here, so we can generate better errors after. 
                $.assign_left_side,
                $.if_statement,
                $.for_statement,
                $.interface_statement
            )),
            '}'
        ),
        
        interface_statement: $ => seq(
            'interface',
            field('name', $.identifier),
            optional(field('interface_ports', $.interface_ports))
        ),

        decl_assign_statement: $ => seq(
            field('assign_left', $.assign_left_side),
            '=',
            field('assign_value', $._expression)
        ),
        assign_left_side: $ => sepSeq1($.assign_to, $._comma),
        assign_to: $ => seq(
            optional(field('write_modifiers', $.write_modifiers)),
            field('expr_or_decl', choice(
                $._expression,
                $.declaration
            ))
        ),
        write_modifiers: $ => choice(
            repeat1(field('item', 'reg')),
            field('item', 'initial')
        ),

        if_statement: $ => seq(
            'if',
            field('condition', $._expression),
            field('then_block', $.block),
            optional(seq(
                'else',
                field('else_block', choice(
                    $.block,
                    $.if_statement
                ))
            ))
        ),
        for_statement: $ => seq(
            'for',
            field('for_decl', $.declaration),
            'in',
            field('from', $._expression),
            '..',
            field('to', $._expression),
            field('block', $.block)
        ),

        // Declarations

        declaration_list: $ => sepSeq1($.declaration, $._comma),

        declaration: $ => seq(
            optional(field('io_port_modifiers', choice(
                'input',
                'output'
            ))),
            optional(field('declaration_modifiers', choice(
                'state',
                'gen'
            ))),
            field('type', $._type),
            field('name', $.identifier),
            optional(field('latency_specifier', $.latency_specifier))
        ),

        latency_specifier: $ => seq(
            '\'',
            field('content', $._expression)
        ),

        // Types

        _type: $ => choice(
            $.template_global,
            $.array_type
        ),

        array_type: $ => seq(
            field('arr', $._type),
            field('arr_idx', $.array_bracket_expression)
        ),

        // Expressions

        _expression: $ => choice(
            $.template_global,
            $.array_op,
            $.number,
            $.parenthesis_expression,
            $.unary_op,
            $.binary_op,
            $.func_call,
            $.field_access
        ),

        unary_op: $ => prec(PREC.unary, seq(
            field('operator', choice('+', '-', '*', '!', '|', '&', '^')),
            field('right', $._expression)
        )),

        binary_op: $ => {
            const TABLE = [
                [PREC.compare, choice('==', '!=', '<', '<=', '>', '>=')],
                [PREC.and, '&'],
                [PREC.or, '|'],
                [PREC.xor, '^'],
                [PREC.additive, choice('+', '-')],
                [PREC.multiplicative, choice('*', '/', '%')],
            ];

            return choice(...TABLE.map(([precedence, operator]) => prec.left(precedence, seq(
                field('left', $._expression),
                field('operator', operator),
                field('right', $._expression)
            ))));
        },

        array_op: $ => prec(PREC.postscript_op, seq(
            field('arr', $._expression),
            field('arr_idx', $.array_bracket_expression)
        )),

        func_call: $ => prec(PREC.postscript_op, seq(
            field('name', $._expression),
            field('arguments', $.parenthesis_expression_list)
        )),

        field_access: $ => prec(PREC.postscript_op, seq(
            field('left', $._expression),
            '.',
            field('name', $.identifier)
        )),
        
        parenthesis_expression_list: $ => seq(
            '(',
            sepSeq($._expression, $._comma),
            ')'
        ),

        parenthesis_expression: $ => seq(
            '(',
            field('content', $._expression),
            ')'
        ),

        array_bracket_expression: $ => seq(
            '[',
            field('content', $._expression),
            ']'
        ),

        // Utilities

        // myFunc::<int, 2>
        template_global: $ => prec(PREC.namespace_path, seq(
            optional(field('is_global_path', '::')),
            field('item', $.identifier),
            repeat(seq(
                '::',
                field('item', choice($.identifier, $.template_params))
            ))
        )),
        
        template_type_param : $ => seq(
            optional(seq(
                field('name', $.identifier),
                '='
            )),
            field('arg', $._type)
        ),
        template_value_param : $ => seq(
            optional(seq(
                field('name', $.identifier),
                '='
            )),
            field('arg', $._expression)
        ),
        template_params: $ => seq(
            '<',
            sepSeq($.template_type_param, $._comma),
            optional(seq(
                ';',
                sepSeq($.template_value_param, $._comma),
            )),
            '>'
        ),
        identifier: $ => /[\p{Alphabetic}_][\p{Alphabetic}_\p{Decimal_Number}]*/,
        number: $ => /\d[\d_]*/,

        _comma: $ => seq(
            ',',
            optional($._linebreak)
        ),

        _linebreak: $ => repeat1('\n'), // For things that must be separated by at least one newline (whitespace after is to optimize gobbling up any extra newlines)

        // Extras

        single_line_comment: $ => /\/\/[^\n]*/,
        multi_line_comment: $ => /\/\*[^\*]*\*+([^\/\*][^\*]*\*+)*\//,
    },

    conflicts: $ => [
        [$._type, $._expression] // Just because LR(1) is too weak to resolve 'ident[] a' vs 'type_name[]'. Tree sitter resolves this itself with more expensive GLR. NOT a precedence relation. 
    ],

    word: $=> $.identifier,

    extras: $ => [
        /[ \t\r]+/, // Non newline whitespace
        $.single_line_comment,
        $.multi_line_comment
    ]
});
