package com.shinsanghoon.streamdeck

object Json {
    fun string(value: String): String = buildString {
        append('"')
        for (ch in value) {
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(ch)
            }
        }
        append('"')
    }

    fun obj(fields: Map<String, String>): String =
        fields.entries.joinToString(separator = ",", prefix = "{", postfix = "}") { (key, value) ->
            "${string(key)}:$value"
        }
}
